import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  chats as initialChats,
  initialStories,
  me,
  seedMessages,
} from "../domain/data";
import type { Chat, Message, Story } from "../domain/data";
import { enrichChat } from "../domain/chatDetails";
import { markChatRead, updateChatPreview } from "../domain/model";
import {
  createForward,
  deleteFromThread,
  messagePreview,
  refreshChatPreview,
} from "../domain/messageActions";
import { setHapticsEnabled } from "../ui/primitives";

export type Profile = {
  name: string;
  avatar: string;
  sound: boolean;
  previews: boolean;
  bio?: string;
  username?: string;
  haptics?: boolean;
};
export type CallRecord = {
  id: string;
  chat: Chat;
  video: boolean;
  seconds: number;
  time: string;
  missed: boolean;
};
export const uid = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export const clock = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const STORAGE_KEY = "messenger-prototype-v1";

export function useMessenger() {
  const [chats, setChats] = useState(initialChats.map(enrichChat));
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [stories, setStories] = useState(initialStories);
  const [history, setHistory] = useState<CallRecord[]>([]);
  const [dark, setDark] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    name: "Alex Morgan",
    avatar: me,
    sound: true,
    previews: true,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const conversationVisible = useRef(true);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const messagesRef = useRef(messages);
  function updateMessages(
    update: (current: Record<string, Message[]>) => Record<string, Message[]>,
  ) {
    messagesRef.current = update(messagesRef.current);
    setMessages(messagesRef.current);
  }
  function updateChats(update: (current: Chat[]) => Chat[]) {
    chatsRef.current = update(chatsRef.current);
    setChats(chatsRef.current);
  }
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const writes = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    void Promise.all([
      AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
        if (!raw || !active) return;
        const saved = JSON.parse(raw);
        if (Array.isArray(saved.chats))
          updateChats(() => saved.chats.map(enrichChat));
        if (saved.messages && typeof saved.messages === "object")
          updateMessages(() => saved.messages);
        if (Array.isArray(saved.stories)) setStories(saved.stories);
        if (Array.isArray(saved.history)) setHistory(saved.history);
        setDark(!!saved.dark);
      }),
      AsyncStorage.getItem("@messenger/settings/v1").then((raw) => {
        if (!raw || !active) return;
        const saved = JSON.parse(raw);
        setHapticsEnabled(saved.haptics !== false);
        if (typeof saved.avatar === "string" && typeof saved.name === "string")
          setProfile(saved);
      }),
    ])
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
      timers.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const snapshot = JSON.stringify({
      chats,
      messages,
      stories,
      history,
      dark,
    });
    writes.current = writes.current
      .then(() => AsyncStorage.setItem(STORAGE_KEY, snapshot))
      .catch(() => {});
  }, [chats, messages, stories, history, dark, loaded]);

  function openChat(chat: Chat) {
    selectedRef.current = chat.id;
    setSelected(chat.id);
    updateMessages((current) =>
      current[chat.id]
        ? current
        : { ...current, [chat.id]: seedMessages(chat) },
    );
    updateChats((current) => markChatRead(current, chat.id));
  }
  function setConversationVisible(visible: boolean) {
    conversationVisible.current = visible;
    const id = selectedRef.current;
    if (visible && id) updateChats((current) => markChatRead(current, id));
  }
  function closeChat() {
    selectedRef.current = null;
    setSelected(null);
  }
  function append(chat: Chat, message: Message, preview: string) {
    if (!chatsRef.current.some((item) => item.id === chat.id && !item.blocked))
      return;
    updateMessages((current) => ({
      ...current,
      [chat.id]: [...(current[chat.id] || seedMessages(chat)), message],
    }));
    updateChats((current) =>
      updateChatPreview(current, {
        id: chat.id,
        preview,
        time: clock(),
        mine: message.mine,
        openChatId: conversationVisible.current ? selectedRef.current : null,
      }),
    );
  }
  function send(partial: Partial<Message>) {
    const chat = chatsRef.current.find((c) => c.id === selectedRef.current);
    if (!chat || chat.blocked || (!partial.kind && !partial.text?.trim()))
      return;
    const text = partial.kind ? undefined : partial.text!.trim();
    const message: Message = {
      ...partial,
      id: uid(),
      mine: true,
      time: clock(),
      createdAt: new Date().toISOString(),
      text,
    };
    if (message.replyTo) {
      const original = messagesRef.current[chat.id]?.find(
        (item) => item.id === message.replyTo!.id,
      );
      message.replyTo = original?.deleted
        ? { id: original.id, mine: original.mine, text: "Message deleted" }
        : { ...message.replyTo };
    }
    append(chat, message, messagePreview(message));
    setTypingIds((ids) => (ids.includes(chat.id) ? ids : [...ids, chat.id]));
    const previous = timers.current.get(chat.id);
    if (previous) clearTimeout(previous);
    timers.current.set(
      chat.id,
      setTimeout(() => {
        const reply = partial.kind
          ? "Thanks for sharing 🤍"
          : "Sounds good! Let’s make it happen ✨";
        append(
          chat,
          {
            id: uid(),
            mine: false,
            text: reply,
            time: clock(),
            createdAt: new Date().toISOString(),
          },
          reply,
        );
        setTypingIds((ids) => ids.filter((id) => id !== chat.id));
        timers.current.delete(chat.id);
      }, 2600),
    );
  }
  function react(messageId: string, emoji: string) {
    if (!selected) return;
    updateMessages((current) => ({
      ...current,
      [selected]: (current[selected] || []).map((message) =>
        message.id === messageId && !message.deleted
          ? {
              ...message,
              reaction: message.reaction === emoji ? undefined : emoji,
            }
          : message,
      ),
    }));
  }
  function addContact(name: string, handle: string, group: boolean) {
    const chat: Chat = {
      id: uid(),
      name: name.trim(),
      avatar: me,
      preview: group ? "Group created" : handle.trim(),
      time: clock(),
      unread: 0,
      group,
      createdAt: new Date().toISOString(),
      username: group ? undefined : handle.trim(),
      memberIds: group ? ["self"] : undefined,
      adminIds: group ? ["self"] : undefined,
      color: "#F5E8DE",
    };
    updateChats((current) => [chat, ...current]);
    updateMessages((current) => ({ ...current, [chat.id]: [] }));
    return chat;
  }
  function markStorySeen(id: string) {
    setStories((current) =>
      current.map((story) =>
        story.id === id && !story.seen ? { ...story, seen: true } : story,
      ),
    );
  }
  function deleteStory(id: string) {
    setStories((current) => current.filter((story) => story.id !== id));
  }
  function shareStory(story: Story) {
    setStories((current) => [...current, { ...story, ownerId: "self" }]);
  }
  function cancelReplies(id: string) {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setTypingIds((ids) => ids.filter((item) => item !== id));
  }
  function deleteMessage(id: string, everyone: boolean) {
    const chatId = selectedRef.current;
    if (!chatId) return;
    const thread = messagesRef.current[chatId] || [];
    const next = deleteFromThread(thread, id, everyone);
    if (next === thread) return;
    updateMessages((current) => ({ ...current, [chatId]: next }));
    updateChats((current) =>
      current.map((chat) =>
        chat.id === chatId ? refreshChatPreview(chat, next) : chat,
      ),
    );
  }
  function forwardMessage(message: Message, targetChatId: string) {
    const target = chatsRef.current.find((chat) => chat.id === targetChatId);
    if (!target) return;
    // A menu may still hold a snapshot from before a deletion.
    const source =
      messagesRef.current[selectedRef.current || ""]?.find(
        (item) => item.id === message.id,
      ) || message;
    const forwarded = createForward(
      source,
      target,
      uid(),
      clock(),
      new Date().toISOString(),
    );
    if (forwarded) append(target, forwarded, messagePreview(forwarded));
  }
  function toggleFlag(id: string, flag: "muted" | "blocked" | "pinned") {
    const chat = chatsRef.current.find((item) => item.id === id);
    if (!chat) return;
    if (flag === "blocked" && !chat.blocked) cancelReplies(id);
    updateChats((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              [flag]: !item[flag],
              ...(flag === "blocked" ? { typing: false } : {}),
            }
          : item,
      ),
    );
  }
  function toggleMute(id: string) {
    toggleFlag(id, "muted");
  }
  function toggleBlock(id: string) {
    toggleFlag(id, "blocked");
  }
  function togglePin(id: string) {
    toggleFlag(id, "pinned");
  }
  function clearChat(id: string) {
    cancelReplies(id);
    updateMessages((current) => ({ ...current, [id]: [] }));
    updateChats((current) =>
      current.map((chat) =>
        chat.id === id ? refreshChatPreview({ ...chat, unread: 0 }, []) : chat,
      ),
    );
  }
  function deleteChat(id: string) {
    cancelReplies(id);
    updateMessages((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    updateChats((current) => current.filter((chat) => chat.id !== id));
    if (selectedRef.current === id) closeChat();
  }
  function addCall(record: CallRecord) {
    setHistory((current) => [record, ...current]);
  }
  return {
    chats,
    messages,
    stories,
    history,
    dark,
    setDark,
    loaded,
    profile,
    setProfile,
    selected,
    typingIds,
    openChat,
    closeChat,
    setConversationVisible,
    send,
    react,
    deleteMessage,
    forwardMessage,
    toggleMute,
    toggleBlock,
    togglePin,
    clearChat,
    deleteChat,
    addContact,
    markStorySeen,
    deleteStory,
    shareStory,
    addCall,
  };
}
