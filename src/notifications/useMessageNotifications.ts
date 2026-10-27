/**
 * Posts Android message notifications for conversations the user is not
 * looking at, and clears them as soon as the conversation is read.
 *
 * The notification thread mirrors the in-app conversation: the same messages,
 * the same contact, and buttons for reply, mark-read and mute.
 */

import { useEffect, useRef } from "react";
import { localAvatarUri, warmAvatars } from "../data/avatars";
import type { Chat, Message } from "../domain/data";
import {
  dismissConversation,
  isSystemNotificationsAvailable,
  showMessage,
} from "../services/systemNotifications";
import { messagePayload } from "../notifications/payloads";

export type MessageNotificationOptions = {
  chats: Chat[];
  messages: Record<string, Message[]>;
  self: { id: string; name: string; avatarUri?: string };
  /** Conversation on screen, if any. */
  visibleChatId: string | null;
  /** A call or overlay may hide the conversation even when one is selected. */
  visible: boolean;
  /** Message previews preference. */
  previews: boolean;
  /** Message sound preference, mapped to the silent Android channel. */
  sound: boolean;
  enabled: boolean;
};

export function useMessageNotifications({
  chats,
  messages,
  self,
  visibleChatId,
  visible,
  previews,
  sound,
  enabled,
}: MessageNotificationOptions) {
  // chatId -> newest incoming message id already announced.
  const announced = useRef(new Map<string, string>());
  const primed = useRef(false);

  useEffect(() => {
    if (!enabled || !isSystemNotificationsAvailable) return;
    const onScreen = visible ? visibleChatId : null;
    if (onScreen) {
      // Record rather than forget: the newest message is being read right now,
      // so leaving the conversation must not announce it as news.
      const open = chats.find((chat) => chat.id === onScreen);
      const last = open ? newestIncoming(messages[onScreen] || []) : undefined;
      if (last) announced.current.set(onScreen, last);
      else announced.current.delete(onScreen);
      void dismissConversation(onScreen).catch(() => {});
    }
    if (!primed.current) {
      // Existing history is not news: record it without notifying.
      for (const chat of chats) {
        const last = newestIncoming(messages[chat.id] || []);
        if (last) announced.current.set(chat.id, last);
      }
      primed.current = true;
      return;
    }
    const targets = chats.filter((chat) => {
      if (chat.id === onScreen || chat.muted || chat.blocked) return false;
      const thread = messages[chat.id] || [];
      const last = newestIncoming(thread);
      return !!last && announced.current.get(chat.id) !== last;
    });
    if (!targets.length) return;
    let cancelled = false;
    void (async () => {
      const avatars: Record<string, string | undefined> = {};
      const avatarPromise = Promise.all(
        [self.avatarUri, ...targets.map((chat) => chat.avatar)]
          .filter((uri): uri is string => !!uri)
          .map(async (uri) => {
            const local = await localAvatarUri(uri).catch(() => undefined);
            if (local) avatars[uri] = local;
          }),
      );
      await avatarPromise;
      if (cancelled) return;
      for (const chat of targets) {
        if (cancelled) return;
        const thread = messages[chat.id] || [];
        const payload = messagePayload({
          chat,
          messages: thread,
          self: {
            id: "self",
            name: self.name,
            avatarUri: self.avatarUri ? avatars[self.avatarUri] : undefined,
          },
          avatars: { [chat.id]: avatars[chat.avatar] },
          previews,
          sound,
        });
        const last = newestIncoming(thread);
        if (!payload || !last) continue;
        const result = await showMessage(payload).catch(() => undefined);
        // Only a posted notification counts as announced. A refused post (no
        // permission, channel off) stays eligible, so granting permission later
        // does not silently swallow the message.
        if (result?.posted === true) announced.current.set(chat.id, last);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chats, messages, visibleChatId, visible, previews, sound, enabled, self.name, self.avatarUri]);

  // Keep the contacts they are most likely to hear from ready to ring.
  useEffect(() => {
    warmAvatars(chats.slice(0, 8).map((chat) => chat.avatar));
  }, [chats]);
}

function newestIncoming(thread: Message[]): string | undefined {
  for (let index = thread.length - 1; index >= 0; index -= 1) {
    if (!thread[index].mine) return thread[index].id;
  }
  return undefined;
}
