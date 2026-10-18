import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  chats as initialChats,
  initialStories,
  me,
  seedMessages,
} from "../domain/data";
import type { Chat, Message, Story } from "../domain/data";
import { markChatRead, updateChatPreview } from "../domain/model";

export type Profile = {
  name: string;
  avatar: string;
  sound: boolean;
  previews: boolean;
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
  const [chats, setChats] = useState(initialChats);
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
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const writes = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    void Promise.all([
      AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
        if (!raw || !active) return;
        const saved = JSON.parse(raw);
        if (Array.isArray(saved.chats)) setChats(saved.chats);
        if (saved.messages && typeof saved.messages === "object")
          setMessages(saved.messages);
        if (Array.isArray(saved.stories)) setStories(saved.stories);
        if (Array.isArray(saved.history)) setHistory(saved.history);
        setDark(!!saved.dark);
      }),
      AsyncStorage.getItem("@messenger/settings/v1").then((raw) => {
        if (!raw || !active) return;
        const saved = JSON.parse(raw);
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
    setMessages((current) =>
      current[chat.id]
        ? current
        : { ...current, [chat.id]: seedMessages(chat) },
    );
    setChats((current) => markChatRead(current, chat.id));
  }
  function setConversationVisible(visible: boolean) {
    conversationVisible.current = visible;
    const id = selectedRef.current;
    if (visible && id) setChats((current) => markChatRead(current, id));
  }
  function closeChat() {
    selectedRef.current = null;
    setSelected(null);
  }
  function append(chat: Chat, message: Message, preview: string) {
    setMessages((current) => ({
      ...current,
      [chat.id]: [...(current[chat.id] || seedMessages(chat)), message],
    }));
    setChats((current) =>
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
    if (!chat || (!partial.kind && !partial.text?.trim())) return;
    const text = partial.kind ? undefined : partial.text!.trim();
    const preview =
      partial.kind === "image"
        ? "Sent a photo"
        : partial.kind === "audio"
          ? "Voice message"
          : partial.kind === "file"
            ? partial.filename || "File"
            : text!;
    append(
      chat,
      { ...partial, id: uid(), mine: true, time: clock(), text },
      `You: ${preview}`,
    );
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
          { id: uid(), mine: false, text: reply, time: clock() },
          reply,
        );
        setTypingIds((ids) => ids.filter((id) => id !== chat.id));
        timers.current.delete(chat.id);
      }, 2600),
    );
  }
  function react(messageId: string, emoji: string) {
    if (!selected) return;
    setMessages((current) => ({
      ...current,
      [selected]: (current[selected] || []).map((message) =>
        message.id === messageId
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
      color: "#F5E8DE",
    };
    setChats((current) => [chat, ...current]);
    setMessages((current) => ({ ...current, [chat.id]: [] }));
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
    setStories((current) => [story, ...current]);
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
    addContact,
    markStorySeen,
    deleteStory,
    shareStory,
    addCall,
  };
}
