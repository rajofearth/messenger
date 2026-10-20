import type { MutableRefObject } from "react";
import type { Chat, Message } from "../domain/data";
import { remoteUid, timeLabel } from "./remoteMessengerTypes";

type AppendLocal = (chat: Chat, message: Message, preview: string) => void;

type SendText = (args: {
  conversationId: string;
  clientMessageId: string;
  text: string;
}) => Promise<unknown>;

type MarkReadThrough = (args: {
  conversationId: string;
  sequence: number;
}) => Promise<unknown>;

type UpdateChats = (next: (current: Chat[]) => Chat[]) => void;

/**
 * Notification replies are retried by the native action queue until they are
 * acknowledged. The local bubble may already exist from a failed attempt, so
 * the idempotent mutation is always called again before the reply is treated
 * as sent.
 */
export function createRemoteReplySender({
  chatsRef,
  messagesRef,
  appendLocal,
  sendText,
}: {
  chatsRef: MutableRefObject<Chat[]>;
  messagesRef: MutableRefObject<Record<string, Message[]>>;
  appendLocal: AppendLocal;
  sendText: SendText;
}) {
  return async function sendTo(chatId: string, text: string, actionId?: string) {
    const body = text.trim();
    if (!body) return;
    const chat = chatsRef.current.find((item) => item.id === chatId);
    if (!chat) {
      // The native action queue retries rejected replies. A missing cache entry
      // is usually a race with a cold start, not a permanent failure.
      throw new Error("CHAT_NOT_FOUND");
    }
    if (chat.blocked) return;
    const clientMessageId = actionId ? `notice-${actionId}` : remoteUid();
    const known = (messagesRef.current[chatId] || []).some(
      (item) => item.id === clientMessageId,
    );
    if (!known) {
      const message: Message = {
        id: clientMessageId,
        text: body,
        mine: true,
        time: timeLabel(),
        createdAt: new Date().toISOString(),
      };
      appendLocal(chat, message, body);
    }
    await sendText({
      conversationId: chatId,
      clientMessageId,
      text: body,
    });
  };
}

/** Clears the badge locally and persists the newest sequence to the server. */
export function createRemoteReadMarker({
  messagesRef,
  updateChats,
  markReadThrough,
}: {
  messagesRef: MutableRefObject<Record<string, Message[]>>;
  updateChats: UpdateChats;
  markReadThrough: MarkReadThrough;
}) {
  return function markRead(chatId: string) {
    updateChats((current) =>
      current.map((item) =>
        item.id === chatId ? { ...item, unread: 0 } : item,
      ),
    );
    const items = messagesRef.current[chatId] || [];
    const sequence = items[items.length - 1]?.sequence;
    if (!sequence) return;
    void markReadThrough({ conversationId: chatId, sequence }).catch(() => {});
  };
}
