import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Chat, Message, MessageStatus } from "../domain/data";
import { messagePreview } from "../domain/messageActions";
import { isConfirmed } from "../domain/threadMerge";
import { messengerRepository } from "../data/messengerRepository";

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

type Args = {
  setMessages: Dispatch<SetStateAction<Record<string, Message[]>>>;
  setCachedChats: Dispatch<SetStateAction<Chat[]>>;
  messagesRef: MutableRefObject<Record<string, Message[]>>;
  chatsRef: MutableRefObject<Chat[]>;
};

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
  args.updateMessages((current) => {
    const next = (current[args.chatId] || []).filter(
      (item) => item.id !== args.messageId,
    );
    // Unconfirmed sends stay in memory only; a restart cannot revive a bubble
    // whose mutation never completed.
    void messengerRepository
      .saveMessages(
        args.chatId,
        next.filter((item) => isConfirmed(item)),
      )
      .catch(() => {});
    return { ...current, [args.chatId]: next };
  });
}
