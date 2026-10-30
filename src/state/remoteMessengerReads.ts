import type { MutableRefObject } from "react";
import type { Chat, Message } from "../domain/data";
import { messagePreview } from "../domain/messageActions";
import { isSendConfirmed } from "../domain/outbox";
import {
  mapMessage,
  remoteUid,
  timeLabel,
  type RemoteMessage,
} from "./remoteMessengerTypes";
import type {
  AppendLocal,
  ConfirmLocalMessage,
  MarkLocalMessageStatus,
} from "./remoteMessengerWriters";

type SendText = (args: {
  conversationId: string;
  clientMessageId: string;
  text: string;
}) => Promise<RemoteMessage>;

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
  confirmLocalMessage,
  markLocalMessageStatus,
  sendText,
}: {
  chatsRef: MutableRefObject<Chat[]>;
  messagesRef: MutableRefObject<Record<string, Message[]>>;
  appendLocal: AppendLocal;
  confirmLocalMessage: ConfirmLocalMessage;
  markLocalMessageStatus: MarkLocalMessageStatus;
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
        status: "sending",
      };
      appendLocal(chat, message, messagePreview(message));
    }
    markLocalMessageStatus({
      chatId,
      messageId: clientMessageId,
      status: "sending",
    });
    try {
      const view = await sendText({
        conversationId: chatId,
        clientMessageId,
        text: body,
      });
      // The reply is acknowledged only once the server returns a sequence; the
      // action queue keeps retrying otherwise.
      if (!isSendConfirmed(view)) throw new Error("SEND_UNCONFIRMED");
      confirmLocalMessage({
        chatId,
        messageId: clientMessageId,
        confirmed: mapMessage(view),
      });
    } catch (error) {
      markLocalMessageStatus({
        chatId,
        messageId: clientMessageId,
        status: "failed",
      });
      throw error;
    }
  };
}

/**
 * Opening or focusing a conversation clears its badge. Unread lives only on
 * this phone, so no server acknowledgement is part of reading.
 */
export function createRemoteReadMarker({
  updateChats,
}: {
  updateChats: UpdateChats;
}) {
  return function markRead(chatId: string) {
    updateChats((current) =>
      current.map((item) =>
        item.id === chatId ? { ...item, unread: 0 } : item,
      ),
    );
  };
}
