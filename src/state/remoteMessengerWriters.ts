import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Chat, Message } from "../domain/data";
import { messengerRepository } from "../data/messengerRepository";

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

  function updateChats(next: (current: Chat[]) => Chat[]) {
    setCachedChats((current) => {
      const value = next(current);
      chatsRef.current = value;
      void messengerRepository.saveChats(value).catch(() => {});
      return value;
    });
  }

  function appendLocal(chat: Chat, message: Message, preview: string) {
    updateMessages((current) => ({
      ...current,
      [chat.id]: [...(current[chat.id] || []), message],
    }));
    updateChats((current) =>
      [chat, ...current.filter((item) => item.id !== chat.id)].map((item) =>
        item.id === chat.id
          ? {
              ...item,
              preview,
              time: message.time,
              unread: message.mine ? item.unread : item.unread + 1,
            }
          : item,
      ),
    );
  }

  return { updateMessages, updateChats, appendLocal };
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
        next.filter((item) => item.sequence !== undefined),
      )
      .catch(() => {});
    return { ...current, [args.chatId]: next };
  });
}
