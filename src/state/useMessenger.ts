import { useEffect, useRef, useState } from "react";
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
import type { ThemePreference } from "../ui/theme";
import { messengerRepository } from "../data/messengerRepository";
import { useThemePreference } from "./useThemePreference";

export type Profile = {
  name: string;
  avatar: string;
  sound: boolean;
  previews: boolean;
  bio?: string;
  username?: string;
  haptics?: boolean;
  /** Master switch for Android system notifications. */
  systemNotifications?: boolean;
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

const DEFAULT_PROFILE: Profile = {
  name: "Alex Morgan",
  avatar: me,
  sound: true,
  previews: true,
};

export function useMessenger() {
  const [chats, setChats] = useState(initialChats.map(enrichChat));
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [stories, setStories] = useState(initialStories);
  const [history, setHistory] = useState<CallRecord[]>([]);
  const [storedTheme, setStoredTheme] = useState<ThemePreference | undefined>();
  const { theme, setTheme, dark, systemDark } = useThemePreference(storedTheme);
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [selected, setSelected] = useState<string | null>(null);
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const conversationVisible = useRef(true);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const messagesRef = useRef(messages);
  // Slices already written, so a state change never rewrites untouched data.
  const savedChats = useRef<Chat[] | null>(null);
  const savedStories = useRef<Story[] | null>(null);
  const savedHistory = useRef<CallRecord[] | null>(null);
  const savedThreads = useRef(new Map<string, Message[]>());
  const threads = useRef(new Map<string, Promise<Message[]>>());
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

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        // One-time upgrade from the single saved blob to per-slice records.
        await messengerRepository.migrateLegacy();
        const [storedChats, storedStories, storedHistory, appearance, settings] =
          await Promise.all([
            messengerRepository.loadChats(),
            messengerRepository.loadStories(),
            messengerRepository.loadHistory(),
            messengerRepository.loadAppearance(),
            messengerRepository.loadSettings(),
          ]);
        if (!active) return;
        if (storedChats?.length) {
          const next = storedChats.map(enrichChat);
          savedChats.current = next;
          updateChats(() => next);
        }
        if (storedStories?.length) {
          savedStories.current = storedStories;
          setStories(storedStories);
        }
        if (storedHistory?.length) {
          savedHistory.current = storedHistory;
          setHistory(storedHistory);
        }
        if (appearance) setStoredTheme(appearance.theme);
        if (settings) {
          setHapticsEnabled(settings.haptics !== false);
          setProfile({
            name: settings.name || DEFAULT_PROFILE.name,
            avatar: settings.avatar || DEFAULT_PROFILE.avatar,
            sound: settings.sound !== false,
            previews: settings.previews !== false,
            systemNotifications: settings.systemNotifications !== false,
          });
        }
      } catch {
        // Damaged storage keeps the seeded demo data rather than blocking startup.
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
      timers.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (!loaded || savedChats.current === chats) return;
    savedChats.current = chats;
    void messengerRepository.saveChats(chats).catch(() => {});
  }, [chats, loaded]);
  useEffect(() => {
    if (!loaded || savedStories.current === stories) return;
    savedStories.current = stories;
    void messengerRepository.saveStories(stories).catch(() => {});
  }, [stories, loaded]);
  useEffect(() => {
    if (!loaded || savedHistory.current === history) return;
    savedHistory.current = history;
    void messengerRepository.saveHistory(history).catch(() => {});
  }, [history, loaded]);
  useEffect(() => {
    if (!loaded) return;
    for (const [id, thread] of Object.entries(messages)) {
      if (savedThreads.current.get(id) === thread) continue;
      savedThreads.current.set(id, thread);
      void messengerRepository.saveMessages(id, thread).catch(() => {});
    }
  }, [messages, loaded]);

  /** Reads one conversation the first time it is opened, then keeps it in memory. */
  function thread(chat: Chat): Promise<Message[]> {
    const cached = messagesRef.current[chat.id];
    if (cached) return Promise.resolve(cached);
    const pending = threads.current.get(chat.id);
    if (pending) return pending;
    const request = messengerRepository
      .loadMessages(chat.id)
      .then((stored) => {
        const thread = stored ?? seedMessages(chat);
        updateMessages((current) =>
          current[chat.id] ? current : { ...current, [chat.id]: thread },
        );
        savedThreads.current.set(chat.id, thread);
        return thread;
      })
      .catch(() => seedMessages(chat))
      .finally(() => {
        threads.current.delete(chat.id);
      });
    threads.current.set(chat.id, request);
    return request;
  }
  function openChat(chat: Chat) {
    selectedRef.current = chat.id;
    setSelected(chat.id);
    updateChats((current) => markChatRead(current, chat.id));
    void thread(chat);
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
  /**
   * Sends a message into a named conversation, used by notification replies.
   * The action id doubles as the message id, so a redelivered action can never
   * post the same reply twice. The thread is loaded first, because appending to
   * the seeded fallback would save that seed over the stored conversation. The
   * promise resolves only once the thread is written, because the notification
   * action is acknowledged after this returns.
   */
  async function sendTo(chatId: string, text: string, actionId?: string) {
    const chat = chatsRef.current.find((item) => item.id === chatId);
    const body = text.trim();
    if (!chat || !body || chat.blocked) return;
    const id = actionId ? `notice-${actionId}` : uid();
    const existing = messagesRef.current[chatId] ?? (await thread(chat));
    if (existing.some((message) => message.id === id)) return;
    const message: Message = {
      id,
      text: body,
      mine: true,
      time: clock(),
      createdAt: new Date().toISOString(),
    };
    let appended: Message[] | undefined;
    updateMessages((current) => {
      const base = current[chatId] ?? existing;
      if (base.some((item) => item.id === id)) return current;
      appended = [...base, message];
      return { ...current, [chatId]: appended };
    });
    const next = appended;
    if (!next) return;
    updateChats((current) =>
      updateChatPreview(current, {
        id: chatId,
        preview: body,
        time: clock(),
        mine: true,
        openChatId: conversationVisible.current ? selectedRef.current : null,
      }),
    );
    savedThreads.current.set(chatId, next);
    await messengerRepository.saveMessages(chatId, next).catch(() => {});
  }
  function markRead(chatId: string) {
    updateChats((current) => markChatRead(current, chatId));
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
    savedThreads.current.set(chat.id, []);
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
  function updateFlag(id: string, flag: "muted" | "blocked" | "pinned", value: boolean) {
    const chat = chatsRef.current.find((item) => item.id === id);
    if (!chat || !!chat[flag] === value) return;
    if (flag === "blocked" && value) cancelReplies(id);
    updateChats((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              [flag]: value,
              ...(flag === "blocked" ? { typing: false } : {}),
            }
          : item,
      ),
    );
  }
  function toggleMute(id: string) {
    const chat = chatsRef.current.find((item) => item.id === id);
    if (chat) updateFlag(id, "muted", !chat.muted);
  }
  function setMuted(id: string, muted: boolean) {
    updateFlag(id, "muted", muted);
  }
  function setBlocked(id: string, blocked: boolean) {
    updateFlag(id, "blocked", blocked);
  }
  function toggleBlock(id: string) {
    const chat = chatsRef.current.find((item) => item.id === id);
    if (chat) updateFlag(id, "blocked", !chat.blocked);
  }
  function togglePin(id: string) {
    const chat = chatsRef.current.find((item) => item.id === id);
    if (chat) updateFlag(id, "pinned", !chat.pinned);
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
    savedThreads.current.delete(id);
    threads.current.delete(id);
    void messengerRepository.removeMessages(id).catch(() => {});
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
    theme,
    setTheme,
    systemDark,
    loaded,
    profile,
    setProfile,
    selected,
    typingIds,
    openChat,
    closeChat,
    setConversationVisible,
    send,
    sendTo,
    markRead,
    react,
    deleteMessage,
    forwardMessage,
    toggleMute,
    setMuted,
    setBlocked,
    toggleBlock,
    togglePin,
    clearChat,
    deleteChat,
    addContact,
    markStorySeen,
    deleteStory,
    shareStory,
    addCall,
    thread,
  };
}
