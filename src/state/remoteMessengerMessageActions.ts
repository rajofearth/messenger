import { Alert } from "react-native";
import type { MutableRefObject } from "react";
import type { Chat, Message } from "../domain/data";
import { localChatPreview } from "../domain/messageActions";
import { deleteLocalMessage } from "./remoteMessengerWriters";

type UpdateMessages = (
  next: (current: Record<string, Message[]>) => Record<string, Message[]>,
) => void;

type UpdateChats = (
  next: (current: Chat[]) => Chat[],
  persist?: boolean,
) => void;

type DeleteForEveryone = (args: {
  conversationId: string;
  messageId: string;
}) => Promise<unknown>;

type Forward = (message: Message, targetChatId: string) => boolean;

/**
 * Delete keeps the same optimistic, device-local behaviour as the rest of the
 * state layer. Deleting for everyone is a relay op; deleting for me is a local
 * tombstone the relay never hears about.
 */
export function createRemoteMessageActions({
  selectedRef,
  messagesRef,
  updateMessages,
  updateChats,
  deleteForEveryone,
  forward,
}: {
  selectedRef: MutableRefObject<string | null>;
  messagesRef: MutableRefObject<Record<string, Message[]>>;
  updateMessages: UpdateMessages;
  updateChats: UpdateChats;
  deleteForEveryone: DeleteForEveryone;
  forward: Forward;
}) {
  /** Drops the bubble and recomputes the inbox preview from what is left. */
  function removeLocal(chatId: string, messageId: string) {
    const remaining = (messagesRef.current[chatId] || []).filter(
      (item) => item.id !== messageId,
    );
    deleteLocalMessage({ chatId, messageId, updateMessages });
    // The server has no inbox row to refresh, so the preview is recomputed
    // here instead of waiting for a snapshot that will never arrive.
    updateChats(
      (current) =>
        current.map((item) =>
          item.id === chatId
            ? { ...item, ...localChatPreview(remaining) }
            : item,
        ),
      false,
    );
  }

  function deleteMessage(id: string, everyone: boolean) {
    const chatId = selectedRef.current;
    const message = chatId
      ? (messagesRef.current[chatId] || []).find((item) => item.id === id)
      : undefined;
    if (!chatId || !message) return;
    if (!everyone || message.status) {
      removeLocal(chatId, id);
      return;
    }
    if (!message.mine) {
      Alert.alert(
        "Not deleted",
        "Only the sender can delete this message for everyone.",
      );
      return;
    }
    void deleteForEveryone({ conversationId: chatId, messageId: id })
      .then(() => {
        // The relay keeps no copy to echo a delete back, so the sender applies
        // its own tombstone as soon as the queue accepted the op.
        removeLocal(chatId, id);
      })
      .catch(() => Alert.alert("Message not deleted", "Please try again."));
  }

  function forwardMessage(message: Message, targetChatId: string) {
    if (message.status) {
      Alert.alert(
        "Message not ready",
        "Wait for this message to finish sending before forwarding it.",
      );
      return;
    }
    // The send path owns the durable copy, the upload and the retry, so a
    // forward is just a new outgoing message in the target conversation.
    if (!forward(message, targetChatId)) {
      Alert.alert("Message not forwarded", "Check your connection and try again.");
    }
  }

  return { deleteMessage, forwardMessage };
}
