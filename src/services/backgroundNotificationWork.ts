import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { localAvatarUri } from "../data/avatars";
import { messengerRepository } from "../data/messengerRepository";
import { messagePayload } from "../notifications/payloads";
import { showCall, showMessage } from "./systemNotifications";
import { cacheRemoteMedia } from "./mediaCache";
import { runRelayDrain } from "./relayDrain";

export async function runBackgroundNotificationWork(
  client: ConvexHttpClient,
  queueId: string,
): Promise<void> {
  if (queueId.startsWith("call:")) {
    await showIncomingCalls(client);
    return;
  }

  const profile = await client.query(api.profiles.me, {});
  if (!profile) return;
  const touched = await runRelayDrain(
    {
      pull: () => client.query(api.relay.pull, {}),
      ack: (queueIds) => client.mutation(api.relay.ack, { queueIds }),
      save: (chatId, messages, queueIds) =>
        messengerRepository.saveRelayBatch(chatId, messages, queueIds),
      materializeMedia: async (entry) => {
        const payload = entry.message;
        if (!payload?.uri) return undefined;
        const local = await cacheRemoteMedia({
          id: payload.id,
          uri: payload.uri,
          filename: payload.filename,
          mimeType: payload.mimeType,
          kind: payload.kind,
        }).catch(() => undefined);
        return local && !/^https?:\/\//i.test(local) ? local : undefined;
      },
      pending: () => messengerRepository.loadPendingAcks(),
      clearPending: (ids) => messengerRepository.clearPendingAcks(ids),
      applyReaction: (chatId, messageId, reaction) =>
        messengerRepository.applyRelayReaction(chatId, messageId, reaction),
      applyDelete: (chatId, messageId) =>
        messengerRepository.applyRelayDelete(chatId, messageId),
    },
    profile.userId,
  );

  const chats = (await messengerRepository.loadChats()) ?? [];
  const settings = await messengerRepository.loadSettings();
  const selfAvatar = await localAvatarUri(profile.avatarUrl ?? "").catch(
    () => undefined,
  );
  for (const conversationId of touched) {
    const chat = chats.find((item) => item.id === conversationId);
    if (!chat || chat.muted || chat.blocked || chat.unread <= 0) continue;
    const messages =
      (await messengerRepository.loadMessages(conversationId)) ?? [];
    const avatar = await localAvatarUri(chat.avatar).catch(() => undefined);
    const payload = messagePayload({
      chat,
      messages,
      self: { id: profile.userId, name: profile.name, avatarUri: selfAvatar },
      avatars: { [chat.id]: avatar },
      previews: settings?.previews !== false,
      sound: settings?.sound !== false,
    });
    if (payload) await showMessage(payload).catch(() => {});
  }
}

async function showIncomingCalls(client: ConvexHttpClient): Promise<void> {
  const incoming = await client.query(api.calls.incoming, {});
  const chats = (await messengerRepository.loadChats()) ?? [];
  for (const item of incoming) {
    const chat = chats.find((candidate) => candidate.id === item.conversationId);
    if (!chat || chat.group || chat.blocked) continue;
    let video = false;
    try {
      video = Boolean((JSON.parse(item.payload) as { video?: boolean }).video);
    } catch {
      continue;
    }
    const avatar = await localAvatarUri(chat.avatar).catch(() => undefined);
    await showCall({
      callId: item.callId,
      person: { id: chat.id, name: chat.name, avatarUri: avatar },
      state: "incoming",
      video,
      timeoutMs: 60_000,
    }).catch(() => {});
    await messengerRepository.savePendingCall({
      callId: item.callId,
      chatId: chat.id,
      video,
      receivedAt: Date.now(),
      timeoutMs: 60_000,
    });
  }
}
