import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Chat, Message, MessageStatus } from "../domain/data";
import { messagePreview } from "../domain/messageActions";
import { isConfirmed } from "../domain/threadMerge";
import { messengerRepository } from "../data/messengerRepository";
import { forgetOutgoing } from "../services/outbox";

export type AppendLocal = (
  chat: Chat,
  message: Message,
  preview: string,
) => void;

export type MarkLocalMessageStatus = (args: {
  chatId: string;
  messageId: string;
  status: MessageStatus;
}) => void;

export type MarkLocalMessageProgress = (args: {
  chatId: string;
  messageId: string;
  progress: number;
}) => void;

export type UpdateLocalMessage = (args: {
  chatId: string;
  messageId: string;
  patch: Partial<Message>;
}) => Message | undefined;

export type ConfirmLocalMessage = (args: {
  chatId: string;
  messageId: string;
  confirmed: Message;
}) => void;

type Args = {
  setMessages: Dispatch<SetStateAction<Record<string, Message[]>>>;
  setCachedChats: Dispatch<SetStateAction<Chat[]>>;
  messagesRef: MutableRefObject<Record<string, Message[]>>;
  chatsRef: MutableRefObject<Chat[]>;
};

/**
 * Confirmation saves are serialized per conversation. Two receipts can arrive
 * back-to-back, and without a chain both could load the stored thread before
 * either write landed, so the store's per-key coalescing would keep only the
 * last one. Module scope is deliberate: the writers object is rebuilt on every
 * render, so a closure-local chain would not be shared by its callbacks.
 */
const threadSaves = new Map<string, Promise<void>>();

/**
 * Merges the confirmed in-memory rows over the stored thread instead of
 * replacing it. At cold start the in-memory thread can hold only the message
 * the outbox just retried; a notification reply can likewise be confirmed
 * before its conversation was ever loaded. Rows are ordered by `sequence`, the
 * same order the server thread uses, before they reach the cache.
 */
function saveConfirmedThread(chatId: string, confirmed: Message[]) {
  const previous = threadSaves.get(chatId) ?? Promise.resolve();
  const save = previous
    .then(async () => {
      const stored = (await messengerRepository.loadMessages(chatId)) ?? [];
      const merged = new Map(stored.map((item) => [item.id, item]));
      // The in-memory copy is newer, so it wins on a duplicate id.
      for (const item of confirmed) merged.set(item.id, item);
      const rows = [...merged.values()]
        .filter((item) => isConfirmed(item))
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
      await messengerRepository.saveMessages(chatId, rows);
    })
    .catch(() => undefined);
  threadSaves.set(chatId, save);
  void save.finally(() => {
    if (threadSaves.get(chatId) === save) threadSaves.delete(chatId);
  });
}

/**
 * Small optimistic writers shared by sending, reacting and preferences.
 * Every write updates the ref first so the next action sees it immediately.
 */
export function createRemoteWriters({
  setMessages,
  setCachedChats,
  messagesRef,
  chatsRef,
}: Args) {
  function updateMessages(
    next: (current: Record<string, Message[]>) => Record<string, Message[]>,
  ) {
    setMessages((current) => {
      const value = next(current);
      messagesRef.current = value;
      return value;
    });
  }

  function updateChats(next: (current: Chat[]) => Chat[], persist = true) {
    setCachedChats((current) => {
      const value = next(current);
      chatsRef.current = value;
      if (persist) void messengerRepository.saveChats(value).catch(() => {});
      return value;
    });
  }

  /**
   * Adds an outgoing bubble in memory. Neither the bubble nor the optimistic
   * inbox row reaches disk: only a server-confirmed snapshot may be persisted,
   * so a killed process cannot revive a message that never arrived.
   */
  function appendLocal(chat: Chat, message: Message, preview: string) {
    const createdAt = message.createdAt ? Date.parse(message.createdAt) : NaN;
    const lastMessageAt = Number.isFinite(createdAt) ? createdAt : Date.now();
    const local: Message =
      message.mine && !message.status
        ? { ...message, status: "sending" }
        : message;
    updateMessages((current) => ({
      ...current,
      [chat.id]: [...(current[chat.id] || []), local],
    }));
    updateChats(
      (current) =>
        [chat, ...current.filter((item) => item.id !== chat.id)].map((item) =>
          item.id === chat.id
            ? {
                ...item,
                preview,
                time: local.time,
                lastMessageAt,
                lastMessageStatus: local.mine ? local.status : undefined,
                unread: local.mine ? item.unread : item.unread + 1,
              }
            : item,
        ),
      false,
    );
  }

  /**
   * Moves an optimistic message between sending, sent and failed. The inbox
   * row is only written to disk once the server confirms the send.
   */
  function markLocalMessageStatus({
    chatId,
    messageId,
    status,
  }: {
    chatId: string;
    messageId: string;
    status: MessageStatus;
  }) {
    const thread = messagesRef.current[chatId] || [];
    const message = thread.find((item) => item.id === messageId);
    if (!message) return;
    const next = {
      ...message,
      status,
      // A retry starts its upload from zero again.
      ...(status === "sending" && message.kind ? { uploadProgress: 0 } : {}),
    };
    updateMessages((current) => ({
      ...current,
      [chatId]: (current[chatId] || []).map((item) =>
        item.id === messageId ? next : item,
      ),
    }));
    if (thread[thread.length - 1]?.id !== messageId) return;
    const createdAt = next.createdAt ? Date.parse(next.createdAt) : NaN;
    updateChats(
      (current) =>
        current.map((item) =>
          item.id === chatId
            ? {
                ...item,
                preview: messagePreview(next),
                time: next.time,
                lastMessageAt: Number.isFinite(createdAt)
                  ? createdAt
                  : item.lastMessageAt,
                lastMessageStatus: status,
              }
            : item,
        ),
      status === "sent",
    );
  }

  /**
   * Replaces fields on an in-memory bubble without touching the confirmed
   * cache. Used to point an attachment at its durable copy and to remember a
   * finalized upload so a retry can reuse the same storage object.
   */
  function updateLocalMessage({
    chatId,
    messageId,
    patch,
  }: {
    chatId: string;
    messageId: string;
    patch: Partial<Message>;
  }) {
    const thread = messagesRef.current[chatId] || [];
    const message = thread.find((item) => item.id === messageId);
    if (!message) return undefined;
    const next = { ...message, ...patch };
    const value = {
      ...messagesRef.current,
      [chatId]: thread.map((item) => (item.id === messageId ? next : item)),
    };
    messagesRef.current = value;
    updateMessages(() => value);
    return next;
  }

  /**
   * Swaps an optimistic bubble for the server's confirmed view. The mutation
   * result is the first point where the message has a sequence, so this is the
   * only place a send becomes `sent`. The confirmed row is merged into the
   * stored thread and written to the cache; the pending bubble never was, so a
   * kill between the two leaves the outbox row in charge of the retry.
   */
  function confirmLocalMessage({
    chatId,
    messageId,
    confirmed,
  }: {
    chatId: string;
    messageId: string;
    confirmed: Message;
  }) {
    const thread = messagesRef.current[chatId] || [];
    const index = thread.findIndex((item) => item.id === messageId);
    if (index === -1) return;
    const next = thread.slice();
    next[index] = { ...confirmed, uri: confirmed.uri ?? thread[index].uri };
    const value = { ...messagesRef.current, [chatId]: next };
    messagesRef.current = value;
    updateMessages(() => value);
    saveConfirmedThread(chatId, next.filter((item) => isConfirmed(item)));
    if (index !== thread.length - 1) return;
    const createdAt = confirmed.createdAt
      ? Date.parse(confirmed.createdAt)
      : NaN;
    updateChats((current) =>
      current.map((item) =>
        item.id === chatId
          ? {
              ...item,
              preview: messagePreview(confirmed),
              time: confirmed.time,
              lastMessageAt: Number.isFinite(createdAt)
                ? createdAt
                : item.lastMessageAt,
              // The server row is now the newest message, so the inbox stops
              // showing a pending send.
              lastMessageStatus: undefined,
            }
          : item,
      ),
    );
  }

  /**
   * Updates only the upload fraction of a local attachment bubble. The inbox
   * preview and the read marker are unaffected until the send is confirmed.
   */
  function markLocalMessageProgress({
    chatId,
    messageId,
    progress,
  }: {
    chatId: string;
    messageId: string;
    progress: number;
  }) {
    updateMessages((current) => ({
      ...current,
      [chatId]: (current[chatId] || []).map((item) =>
        item.id === messageId ? { ...item, uploadProgress: progress } : item,
      ),
    }));
  }

  return {
    updateMessages,
    updateChats,
    appendLocal,
    updateLocalMessage,
    confirmLocalMessage,
    markLocalMessageStatus,
    markLocalMessageProgress,
  };
}

/** Removes one message from the device copy without touching the server. */
export function deleteLocalMessage(args: {
  chatId: string;
  messageId: string;
  updateMessages: (
    next: (current: Record<string, Message[]>) => Record<string, Message[]>,
  ) => void;
}) {
  // A deleted bubble must not be revived by the outbox on the next launch.
  void forgetOutgoing(args.messageId);
  // Upsert-only thread saves would bring this row back, so delete it directly.
  void messengerRepository
    .deleteMessage(args.chatId, args.messageId)
    .catch(() => {});
  args.updateMessages((current) => {
    const next = (current[args.chatId] || []).filter(
      (item) => item.id !== args.messageId,
    );
    return { ...current, [args.chatId]: next };
  });
}
