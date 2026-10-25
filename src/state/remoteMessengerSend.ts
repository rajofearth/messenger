import { Alert } from "react-native";
import type { MutableRefObject } from "react";
import type { Chat, Message } from "../domain/data";
import { messagePreview } from "../domain/messageActions";
import { isSendConfirmed } from "../domain/outbox";
import {
  forgetOutgoing,
  keepOutgoingCopy,
  rememberOutgoing,
  updateOutgoing,
} from "../services/outbox";
import {
  attachmentErrorMessage,
  sendAttachmentMessage,
  type SendAttachment,
} from "./remoteMessengerUploads";
import {
  mapMessage,
  remoteUid,
  timeLabel,
  type RemoteMessage,
} from "./remoteMessengerTypes";
import type {
  AppendLocal,
  ConfirmLocalMessage,
  MarkLocalMessageProgress,
  MarkLocalMessageStatus,
  UpdateLocalMessage,
} from "./remoteMessengerWriters";

type SendText = (args: {
  conversationId: string;
  clientMessageId: string;
  text: string;
  replyToMessageId?: string;
}) => Promise<RemoteMessage>;

type Args = {
  selectedRef: MutableRefObject<string | null>;
  chatsRef: MutableRefObject<Chat[]>;
  messagesRef: MutableRefObject<Record<string, Message[]>>;
  appendLocal: AppendLocal;
  updateLocalMessage: UpdateLocalMessage;
  confirmLocalMessage: ConfirmLocalMessage;
  markLocalMessageStatus: MarkLocalMessageStatus;
  markLocalMessageProgress: MarkLocalMessageProgress;
  sendText: SendText;
  sendAttachment: SendAttachment;
};

export type RetryMessage = (
  messageId: string,
  options?: { silent?: boolean },
) => boolean;

/**
 * Owns text and attachment sends plus retries. Every send is recorded in the
 * durable outbox first, an attachment is copied into app documents before it is
 * uploaded, and a failed message keeps its bubble, local URI, finalized storage
 * id and client message id so a retry reuses all of them.
 */
export function createRemoteSend({
  selectedRef,
  chatsRef,
  messagesRef,
  appendLocal,
  updateLocalMessage,
  confirmLocalMessage,
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

  /**
   * Applies the mutation result. A receipt without a sequence is not a
   * confirmation, so it throws and the row stays queued for a retry.
   */
  function applyReceipt(chatId: string, message: Message, view: RemoteMessage) {
    if (!isSendConfirmed(view)) throw new Error("SEND_UNCONFIRMED");
    confirmLocalMessage({
      chatId,
      messageId: message.id,
      confirmed: mapMessage(view),
    });
    return forgetOutgoing(message.id);
  }

  async function deliverText(chatId: string, message: Message) {
    try {
      await rememberOutgoing(chatId, message);
      const view = await sendText({
        conversationId: chatId,
        clientMessageId: message.id,
        text: message.text ?? "",
        replyToMessageId: message.replyTo?.id,
      });
      await applyReceipt(chatId, message, view);
    } catch {
      // The outbox row stays so the next launch can retry the same client id.
      markLocalMessageStatus({
        chatId,
        messageId: message.id,
        status: "failed",
      });
    }
  }

  async function deliverAttachment(
    chatId: string,
    message: Message,
    silent = false,
  ) {
    try {
      await rememberOutgoing(chatId, message);
      const durable = await keepOutgoingCopy(message);
      let sending = message;
      if (durable.uri && durable.uri !== message.uri) {
        sending =
          updateLocalMessage({
            chatId,
            messageId: message.id,
            patch: { uri: durable.uri },
          }) ?? durable;
        await updateOutgoing(chatId, sending);
      }
      const view = await sendAttachmentMessage({
        chatId,
        message: sending,
        sendAttachment,
        onProgress: (progress) =>
          markLocalMessageProgress({
            chatId,
            messageId: message.id,
            progress,
          }),
        // Persist the finalized blob before the mutation, so a retry after a
        // failed send reuses the same parts instead of hitting
        // IDEMPOTENCY_CONFLICT with a new storage id.
        onUploaded: async (storageId) => {
          const uploaded =
            updateLocalMessage({
              chatId,
              messageId: message.id,
              patch: { storageId },
            }) ?? { ...sending, storageId };
          await updateOutgoing(chatId, uploaded);
        },
      });
      await applyReceipt(chatId, message, view);
    } catch (error) {
      markLocalMessageStatus({
        chatId,
        messageId: message.id,
        status: "failed",
      });
      if (!silent) {
        Alert.alert("Attachment not sent", attachmentErrorMessage(error));
      }
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

  /**
   * Retries a failed bubble. Automatic resume passes `silent`, so a permanent
   * failure does not stack alerts. Returns whether a retry actually started.
   */
  function retryMessage(
    messageId: string,
    options?: { silent?: boolean },
  ): boolean {
    const found = findMessage(messageId);
    if (!found) return false;
    const { chat, message } = found;
    if (!message.mine || message.status !== "failed") return false;
    if (chat.blocked || inFlight.has(messageId)) return false;
    if (!message.kind && !message.text?.trim()) return false;
    const sending: Message = { ...message, status: "sending" };
    markLocalMessageStatus({
      chatId: chat.id,
      messageId,
      status: "sending",
    });
    inFlight.add(messageId);
    const done = () => inFlight.delete(messageId);
    if (message.kind) {
      void deliverAttachment(chat.id, sending, options?.silent).finally(done);
    } else {
      void deliverText(chat.id, sending).finally(done);
    }
    return true;
  }

  return { send, retryMessage };
}
