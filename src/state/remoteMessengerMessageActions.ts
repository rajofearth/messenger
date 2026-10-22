import { Alert } from "react-native";
import type { MutableRefObject } from "react";
import type { Chat, Message } from "../domain/data";
import { localChatPreview } from "../domain/messageActions";
import { deleteLocalMessage } from "./remoteMessengerWriters";
import { remoteUid } from "./remoteMessengerTypes";

type UpdateMessages = (
  next: (current: Record<string, Message[]>) => Record<string, Message[]>,
) => void;

type UpdateChats = (
  next: (current: Chat[]) => Chat[],
  persist?: boolean,
) => void;

type DeleteForMe = (args: {
  conversationId: string;
  messageId: string;
}) => Promise<unknown>;

type DeleteForEveryone = (args: {
  conversationId: string;
  messageId: string;
  expectedRevision: number;
}) => Promise<unknown>;

type Forward = (args: {
  sourceConversationId: string;
  targetConversationId: string;
  messageId: string;
  clientMessageId: string;
}) => Promise<unknown>;

/**
 * Delete and forward keep the same optimistic/device-local behaviour as the
 * rest of the state layer while persisting the server-side copy in parallel.
 */
export function createRemoteMessageActions({
  selectedRef,
  messagesRef,
  updateMessages,
  updateChats,
  deleteForMe,
  deleteForEveryone,
  forward,
}: {
  selectedRef: MutableRefObject<string | null>;
  messagesRef: MutableRefObject<Record<string, Message[]>>;
  updateMessages: UpdateMessages;
  updateChats: UpdateChats;
  deleteForMe: DeleteForMe;
  deleteForEveryone: DeleteForEveryone;
  forward: Forward;
}) {
  function deleteMessage(id: string, everyone: boolean) {
    const chatId = selectedRef.current;
    const message = chatId
      ? (messagesRef.current[chatId] || []).find((item) => item.id === id)
      : undefined;
    if (!chatId || !message) return;
    if (!everyone) {
      const remaining = (messagesRef.current[chatId] || []).filter(
        (item) => item.id !== id,
      );
      deleteLocalMessage({ chatId, messageId: id, updateMessages });
      // The server never saw an unconfirmed bubble, so no inbox refresh will
      // fix the preview after it is deleted. Recompute it from what is left.
      updateChats(
        (current) =>
          current.map((item) =>
            item.id === chatId
              ? { ...item, ...localChatPreview(remaining) }
              : item,
          ),
        false,
      );
      void deleteForMe({ conversationId: chatId, messageId: id }).catch(
        () => {},
      );
      return;
    }
    if (!message.mine || !message.revision) {
      Alert.alert(
        "Not deleted",
        "Only the sender can delete this message for everyone.",
      );
      return;
    }
    void deleteForEveryone({
      conversationId: chatId,
      messageId: id,
      expectedRevision: message.revision,
    }).catch(() => Alert.alert("Message not deleted", "Please try again."));
  }

  async function forwardMessage(message: Message, targetChatId: string) {
    const sourceConversationId = selectedRef.current;
    if (!sourceConversationId) return;
    if (message.status) {
      Alert.alert(
        "Message not ready",
        "Wait for this message to finish sending before forwarding it.",
      );
      return;
    }
    try {
      await forward({
        sourceConversationId,
        targetConversationId: targetChatId,
        messageId: message.id,
        clientMessageId: remoteUid(),
      });
    } catch {
      Alert.alert("Message not forwarded", "Check your connection and try again.");
    }
  }

  return { deleteMessage, forwardMessage };
}
