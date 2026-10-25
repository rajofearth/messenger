import type { MutableRefObject } from "react";
import type { Chat, Message } from "../domain/data";
import { messengerRepository } from "../data/messengerRepository";
import { forgetChat } from "../services/outbox";

type UpdateChats = (next: (current: Chat[]) => Chat[]) => void;
type UpdateMessages = (
  next: (current: Record<string, Message[]>) => Record<string, Message[]>,
) => void;

type Args = {
  chatsRef: MutableRefObject<Chat[]>;
  updateChats: UpdateChats;
  updateMessages: UpdateMessages;
  setPreference: (args: {
    conversationId: string;
    muted?: boolean;
    blocked?: boolean;
    mediaVisibility?: "app" | "gallery";
  }) => Promise<unknown>;
  clearPreference: (args: {
    conversationId: string;
    through: number;
  }) => Promise<unknown>;
  hidePreference: (args: {
    conversationId: string;
    hiddenAt: number;
  }) => Promise<unknown>;
  closeChat: () => void;
  isSelected: (id: string) => boolean;
};

/** Mute, block, gallery visibility, clear and delete all stay optimistic. */
export function createChatPreferences({
  chatsRef,
  updateChats,
  updateMessages,
  setPreference,
  clearPreference,
  hidePreference,
  closeChat,
  isSelected,
}: Args) {
  function updatePreference(
    id: string,
    patch: Partial<Pick<Chat, "muted" | "blocked" | "mediaVisibility">>,
  ) {
    updateChats((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function setMuted(id: string, muted: boolean) {
    updatePreference(id, { muted });
    void setPreference({ conversationId: id, muted }).catch(() => {});
  }

  function setBlocked(id: string, blocked: boolean) {
    updatePreference(id, { blocked });
    void setPreference({ conversationId: id, blocked }).catch(() => {});
  }

  function setMediaVisibility(id: string, mediaVisibility: "app" | "gallery") {
    updatePreference(id, { mediaVisibility });
    void setPreference({ conversationId: id, mediaVisibility }).catch(() => {});
  }

  function toggleMute(id: string) {
    const chat = chatsRef.current.find((item) => item.id === id);
    if (chat) setMuted(id, !chat.muted);
  }

  function toggleBlock(id: string) {
    const chat = chatsRef.current.find((item) => item.id === id);
    if (chat) setBlocked(id, !chat.blocked);
  }

  function togglePin(_id: string) {
    // Pinning remains local until it is added to the server inbox model.
  }

  function clearChat(id: string) {
    updateMessages((current) => ({ ...current, [id]: [] }));
    // Clearing history also drops any send the outbox would otherwise resume.
    void forgetChat(id);
    updateChats((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              preview: "No messages yet",
              time: "",
              unread: 0,
              lastMessageAt: undefined,
              lastMessageStatus: undefined,
            }
          : item,
      ),
    );
    void messengerRepository.saveMessages(id, []).catch(() => {});
    void clearPreference({
      conversationId: id,
      through: Date.now(),
    }).catch(() => {});
  }

  function deleteChat(id: string) {
    clearChat(id);
    updateChats((current) => current.filter((item) => item.id !== id));
    void messengerRepository.removeMessages(id).catch(() => {});
    void hidePreference({
      conversationId: id,
      hiddenAt: Date.now(),
    }).catch(() => {});
    if (isSelected(id)) closeChat();
  }

  return {
    setMuted,
    setBlocked,
    setMediaVisibility,
    toggleMute,
    toggleBlock,
    togglePin,
    clearChat,
    deleteChat,
  };
}
