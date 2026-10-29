import { Alert } from "react-native";
import type { MutableRefObject } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { Chat, Message } from "../domain/data";
import { messagePreview } from "../domain/messageActions";
import { isSendConfirmed } from "../domain/outbox";
import { relayErrorMessage } from "../services/relayConfig";
import {
  forgetOutgoing,
  keepOutgoingCopy,
  outboxGeneration,
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

type RelaySendArgs = {
  conversationId: string;
  clientMessageId: string;
  text?: string;
  replyToMessageId?: string;
  storageId?: Id<"_storage">;
};

/** The relay receipt omits `mine`; the adapter adds it back. */
type RelaySend = (args: RelaySendArgs) => Promise<Omit<RemoteMessage, "mine">>;
/** A relay send after the adapter, carrying the sender flag both senders need. */
type RelayConfirm = (args: RelaySendArgs) => Promise<RemoteMessage>;

/** relay.send spells an attachment caption `text`; the upload path says `caption`. */
function relayAttachmentSender(relay: RelayConfirm): SendAttachment {
  return (args) =>
    relay({
      conversationId: args.conversationId,
      clientMessageId: args.clientMessageId,
      text: args.caption,
      replyToMessageId: args.replyToMessageId,
      storageId: args.storageId,
    });
}

/**
 * The relay receipt carries no sender flag, so stamp this device's send as
 * `mine` before the receipt replaces the optimistic bubble. Both send shapes
 * come from the same relay mutation so the rollback flag has one owner.
 */
export function relaySendPath(relay: RelaySend): {
  sendText: SendText;
  sendAttachment: SendAttachment;
} {
  const send: RelayConfirm = (args) =>
    relay(args).then((receipt) => ({ ...receipt, mine: true }));
  return {
    sendText: send,
    sendAttachment: relayAttachmentSender(send),
  };
}

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
 * Owns text and attachment sends plus retries. A text send is recorded in the
 * durable outbox first; an attachment is copied into app documents before its
 * row is written, so a missing source fails without leaving a row that can
 * never succeed. A failed message keeps its bubble, local URI, finalized
 * storage id and client message id so a retry reuses all of them.
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
    const confirmed = mapMessage(view);
    // A relay receipt points at the Convex blob, and the recipient's ack deletes
    // that blob once it is delivered. The upload path already keeps a durable
    // copy on this phone, so the confirmed row keeps that copy instead. The
    // stored widths go with the blob, so they are dropped here too.
    const kept =
      message.kind && message.uri?.startsWith("file:")
        ? { ...confirmed, uri: message.uri, variants: undefined }
        : confirmed;
    confirmLocalMessage({
      chatId,
      messageId: message.id,
      confirmed: kept,
    });
    return forgetOutgoing(message.id);
  }

  async function deliverText(
    chatId: string,
    message: Message,
    silent = false,
  ) {
    try {
      await rememberOutgoing(chatId, message);
      const view = await sendText({
        conversationId: chatId,
        clientMessageId: message.id,
        text: message.text ?? "",
        replyToMessageId: message.replyTo?.id,
      });
      await applyReceipt(chatId, message, view);
    } catch (error) {
      // The outbox row stays so the next launch can retry the same client id.
      markLocalMessageStatus({
        chatId,
        messageId: message.id,
        status: "failed",
      });
      const notice = relayErrorMessage(error);
      if (!silent && notice) Alert.alert("Message not sent", notice);
    }
  }

  async function deliverAttachment(
    chatId: string,
    message: Message,
    silent = false,
  ) {
    try {
      const startedIn = outboxGeneration();
      const durable = await keepOutgoingCopy(message);
      // Sign-out during the copy clears the queue; do not enqueue or upload
      // the previous account's attachment.
      if (startedIn !== outboxGeneration()) return;
      if (!durable) throw new Error("MISSING_ATTACHMENT");
      await rememberOutgoing(chatId, durable, startedIn);
      let sending = durable;
      if (durable.uri !== message.uri) {
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
        Alert.alert(
          "Attachment not sent",
          relayErrorMessage(error) ?? attachmentErrorMessage(error),
        );
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
      void deliverText(chat.id, sending, options?.silent).finally(done);
    }
    return true;
  }

  return { send, retryMessage };
}
