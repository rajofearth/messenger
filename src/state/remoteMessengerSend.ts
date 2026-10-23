import { Alert } from "react-native";
import type { MutableRefObject } from "react";
import type { Chat, Message } from "../domain/data";
import { messagePreview } from "../domain/messageActions";
import {
  attachmentErrorMessage,
  sendAttachmentMessage,
  type SendAttachment,
} from "./remoteMessengerUploads";
import { remoteUid, timeLabel } from "./remoteMessengerTypes";
import type {
  AppendLocal,
  MarkLocalMessageProgress,
  MarkLocalMessageStatus,
} from "./remoteMessengerWriters";

type SendText = (args: {
  conversationId: string;
  clientMessageId: string;
  text: string;
  replyToMessageId?: string;
}) => Promise<unknown>;

type Args = {
  selectedRef: MutableRefObject<string | null>;
  chatsRef: MutableRefObject<Chat[]>;
  messagesRef: MutableRefObject<Record<string, Message[]>>;
  appendLocal: AppendLocal;
  markLocalMessageStatus: MarkLocalMessageStatus;
  markLocalMessageProgress: MarkLocalMessageProgress;
  sendText: SendText;
  sendAttachment: SendAttachment;
};

/**
 * Owns text and attachment sends plus retries. A failed message keeps its
 * bubble, text, local URI and client message id; retrying reuses all of them so
 * the server's client-id deduplication still holds.
 */
export function createRemoteSend({
  selectedRef,
  chatsRef,
  messagesRef,
  appendLocal,
  markLocalMessageStatus,
  markLocalMessageProgress,
  sendText,
  sendAttachment,
}: Args) {
  const inFlight = new Set<string>();

  function findMessage(messageId: string) {
    for (const chat of chatsRef.current) {
      const message = (messagesRef.current[chat.id] || []).find(
        (item) => item.id === messageId,
      );
      if (message) return { chat, message };
    }
    return null;
  }

  async function deliverText(chatId: string, message: Message) {
    try {
      await sendText({
        conversationId: chatId,
        clientMessageId: message.id,
        text: message.text ?? "",
        replyToMessageId: message.replyTo?.id,
      });
      markLocalMessageStatus({
        chatId,
        messageId: message.id,
        status: "sent",
      });
    } catch {
      markLocalMessageStatus({
        chatId,
        messageId: message.id,
        status: "failed",
      });
    }
  }

  async function deliverAttachment(chatId: string, message: Message) {
    try {
      await sendAttachmentMessage({
        chatId,
        message,
        sendAttachment,
        onProgress: (progress) =>
          markLocalMessageProgress({
            chatId,
            messageId: message.id,
            progress,
          }),
      });
      markLocalMessageStatus({
        chatId,
        messageId: message.id,
        status: "sent",
      });
    } catch (error) {
      markLocalMessageStatus({
        chatId,
        messageId: message.id,
        status: "failed",
      });
      Alert.alert("Attachment not sent", attachmentErrorMessage(error));
    }
  }

  function send(partial: Partial<Message>) {
    const chat = chatsRef.current.find(
      (item) => item.id === selectedRef.current,
    );
    if (!chat || chat.blocked) return;
    if (partial.kind) {
      if (!partial.uri) return;
      const message: Message = {
        ...partial,
        id: remoteUid(),
        mine: true,
        time: timeLabel(),
        createdAt: new Date().toISOString(),
        status: "sending",
        uploadProgress: 0,
      };
      appendLocal(chat, message, messagePreview(message));
      void deliverAttachment(chat.id, message);
      return;
    }
    const text = partial.text?.trim();
    if (!text) return;
    const message: Message = {
      ...partial,
      id: remoteUid(),
      text,
      mine: true,
      time: timeLabel(),
      createdAt: new Date().toISOString(),
      status: "sending",
    };
    appendLocal(chat, message, messagePreview(message));
    void deliverText(chat.id, message);
  }

  function retryMessage(messageId: string) {
    const found = findMessage(messageId);
    if (!found) return;
    const { chat, message } = found;
    if (!message.mine || message.status !== "failed") return;
    if (chat.blocked || inFlight.has(messageId)) return;
    if (!message.kind && !message.text?.trim()) return;
    const sending: Message = { ...message, status: "sending" };
    markLocalMessageStatus({
      chatId: chat.id,
      messageId,
      status: "sending",
    });
    inFlight.add(messageId);
    const done = () => inFlight.delete(messageId);
    if (message.kind) void deliverAttachment(chat.id, sending).finally(done);
    else void deliverText(chat.id, sending).finally(done);
  }

  return { send, retryMessage };
}
