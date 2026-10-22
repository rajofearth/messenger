import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Chat, Message, Story } from "../domain/data";
import { newestReadSequence } from "../domain/threadMerge";
import { messengerRepository } from "../data/messengerRepository";
import { deviceIdentity } from "../services/deviceIdentity";
import type { ThemePreference } from "../ui/theme";
import { useThemePreference } from "./useThemePreference";
import type { SettingsProfile } from "../features/profile/SettingsPreferences";
import {
  mapMessage,
  remoteUid,
  type RemoteCallRecord,
  type RemoteProfile,
} from "./remoteMessengerTypes";
import { useRemoteCache } from "./useRemoteCache";
import { useRemotePresence } from "./useRemotePresence";
import { useRemoteServerSync } from "./useRemoteServerSync";
import { useRemoteThreadMedia } from "./useRemoteThreadMedia";
import { createRemoteContact } from "./remoteMessengerContacts";
import { saveTrackedMedia } from "./remoteMessengerMedia";
import { createChatPreferences } from "./remoteMessengerPreferences";
import { saveRemoteProfile } from "./remoteMessengerProfile";
import {
  uploadAndCreateStory,
} from "./remoteMessengerUploads";
import { createRemoteWriters } from "./remoteMessengerWriters";
import { createRemoteSend } from "./remoteMessengerSend";
import {
  createRemoteReadMarker,
  createRemoteReplySender,
} from "./remoteMessengerReads";
import { createRemoteMessageActions } from "./remoteMessengerMessageActions";

export type { RemoteCallRecord, RemoteProfile } from "./remoteMessengerTypes";

export function useRemoteMessenger() {
  const remoteChats = useQuery(api.chat.listInbox, {});
  const remoteProfile = useQuery(api.profiles.me, {});
  const remoteStories = useQuery(api.stories.list, { limit: 50 });
  const ensureProfile = useMutation(api.profiles.ensure);
  const updateProfile = useMutation(api.profiles.update);
  const createDirect = useMutation(api.chat.createDirect);
  const createGroup = useMutation(api.chat.createGroup);
  const sendTextMutation = useMutation(api.chat.sendText);
  const sendAttachmentMutation = useMutation(api.chat.sendAttachment);
  const markReadMutation = useMutation(api.chat.markReadThrough);
  const reactionMutation = useMutation(api.chat.setReaction);
  const deleteMessageMutation = useMutation(api.chat.deleteOwnMessage);
  const deleteForMeMutation = useMutation(api.chat.deleteForMe);
  const forwardMessageMutation = useMutation(api.chat.forwardMessage);
  const storySeenMutation = useMutation(api.stories.markSeen);
  const storyDeleteMutation = useMutation(api.stories.remove);
  const storyCreateMutation = useMutation(api.stories.create);
  const heartbeatOnlineMutation = useMutation(api.chat.heartbeatOnline);
  const heartbeatPresenceMutation = useMutation(api.chat.heartbeatPresence);
  const setTypingMutation = useMutation(api.chat.setTyping);
  const setPreferenceMutation = useMutation(api.preferences.set);
  const clearPreferenceMutation = useMutation(api.preferences.clear);
  const hidePreferenceMutation = useMutation(api.preferences.hide);
  const registerDeviceMutation = useMutation(api.devices.register);
  const {
    cachedChats,
    setCachedChats,
    messages,
    setMessages,
    stories,
    setStories,
    history,
    setHistory,
    settings,
    setSettings,
    storedTheme,
    gallerySaved,
    setGallerySaved,
    localReady,
  } = useRemoteCache();
  const [selected, setSelected] = useState<string | null>(null);
  const [roomToken, setRoomToken] = useState<string | null>(null);
  const selectedRef = useRef(selected);
  const chatsRef = useRef<Chat[]>([]);
  const messagesRef = useRef(messages);
  const storiesRef = useRef(stories);
  const gallerySavedRef = useRef(new Set(gallerySaved));
  const uploadedAvatars = useRef(new Map<string, Id<"_storage">>());
  const onlineSession = useRef(remoteUid());
  const presenceSession = useRef(remoteUid());
  const [conversationVisible, setConversationVisibleState] = useState(true);
  const { theme, setTheme, dark, systemDark } = useThemePreference(storedTheme);

  selectedRef.current = selected;
  messagesRef.current = messages;
  storiesRef.current = stories;
  gallerySavedRef.current = new Set(gallerySaved);

  const remoteThreadRows = useQuery(
    api.chat.listMessages,
    selected ? { conversationId: selected, limit: 100 } : "skip",
  );
  const remoteThread = useMemo(
    () => remoteThreadRows?.map(mapMessage),
    [remoteThreadRows],
  );
  const presence = useQuery(
    api.chat.listPresence,
    selected && roomToken ? { conversationId: selected, roomToken } : "skip",
  );

  useEffect(() => {
    void deviceIdentity()
      .then((device) => registerDeviceMutation(device))
      .catch(() => {});
  }, [registerDeviceMutation]);

  useEffect(() => {
    if (!remoteProfile) return;
    setSettings((current) => ({
      ...current,
      name: remoteProfile.name,
      username: remoteProfile.username,
      bio: remoteProfile.bio,
      avatar: remoteProfile.avatarUrl || current.avatar,
    }));
  }, [remoteProfile, setSettings]);

  useEffect(() => {
    if (remoteProfile !== null || !localReady) return;
    void ensureProfile({}).catch(() => {});
  }, [ensureProfile, localReady, remoteProfile]);

  useRemoteServerSync({
    remoteChats,
    remoteStories,
    remoteThread,
    selected,
    conversationVisible,
    chatsRef,
    storiesRef,
    setCachedChats,
    setStories,
    setMessages,
    markReadThrough: markReadMutation,
  });

  const chats = useMemo(() => {
    // The cache is the single source of truth on screen. The server sync writes
    // remoteChats into it, so optimistic edits survive until the next sync.
    const base = cachedChats;
    const active =
      selected && conversationVisible
        ? base.map((item) =>
            item.id === selected && item.unread
              ? { ...item, unread: 0 }
              : item,
          )
        : base;
    const next =
      selected && presence?.some((item) => item.online && item.subjectId !== remoteProfile?.userId)
        ? active.map((item) =>
            item.id === selected ? { ...item, online: true } : item,
          )
        : active;
    chatsRef.current = next;
    return next;
  }, [
    cachedChats,
    conversationVisible,
    presence,
    remoteProfile?.userId,
    selected,
  ]);
  const selectedMediaVisibility = chats.find(
    (item) => item.id === selected,
  )?.mediaVisibility;

  useRemoteThreadMedia({
    selected,
    remoteThread,
    mediaVisibility: selectedMediaVisibility,
    messagesRef,
    setMessages,
    setGallerySaved,
    gallerySavedRef,
  });

  useRemotePresence({
    selected,
    onlineSession,
    presenceSession,
    onRoomToken: setRoomToken,
    heartbeatOnline: heartbeatOnlineMutation,
    heartbeatPresence: heartbeatPresenceMutation,
    setTyping: setTypingMutation,
  });
  const profile: RemoteProfile = useMemo(
    () => ({
      name: settings.name,
      avatar: settings.avatar,
      sound: settings.sound,
      previews: settings.previews,
      bio: settings.bio,
      username: settings.username,
      haptics: settings.haptics,
      systemNotifications: settings.systemNotifications,
    }),
    [settings],
  );
  const typingIds = useMemo(
    () =>
      selected &&
      presence?.some(
        (item) => item.typing && item.subjectId !== remoteProfile?.userId,
      )
        ? [selected]
        : [],
    [presence, remoteProfile?.userId, selected],
  );
  const loaded = localReady;

  const {
    updateMessages,
    updateChats,
    appendLocal,
    markLocalMessageStatus,
  } = createRemoteWriters({
    setMessages,
    setCachedChats,
    messagesRef,
    chatsRef,
  });
  const sendTo = createRemoteReplySender({
    chatsRef,
    messagesRef,
    appendLocal,
    markLocalMessageStatus,
    sendText: sendTextMutation,
  });
  const markRead = createRemoteReadMarker({
    messagesRef,
    updateChats,
    markReadThrough: markReadMutation,
  });
  const { deleteMessage, forwardMessage } = createRemoteMessageActions({
    selectedRef,
    messagesRef,
    updateMessages,
    updateChats,
    deleteForMe: deleteForMeMutation,
    deleteForEveryone: deleteMessageMutation,
    forward: forwardMessageMutation,
  });

  const {
    setMuted,
    setBlocked,
    setMediaVisibility,
    toggleMute,
    toggleBlock,
    togglePin,
    clearChat,
    deleteChat,
  } = createChatPreferences({
    chatsRef,
    updateChats,
    updateMessages,
    setPreference: setPreferenceMutation,
    clearPreference: clearPreferenceMutation,
    hidePreference: hidePreferenceMutation,
    closeChat,
    isSelected: (id) => selectedRef.current === id,
  });

  async function thread(chat: Chat): Promise<Message[]> {
    const cached = messagesRef.current[chat.id];
    if (cached) return cached;
    const stored = await messengerRepository.loadMessages(chat.id);
    const next = stored || [];
    updateMessages((current) => ({ ...current, [chat.id]: next }));
    return next;
  }

  function openChat(chat: Chat) {
    selectedRef.current = chat.id;
    setSelected(chat.id);
    updateChats((current) =>
      current.map((item) =>
        item.id === chat.id ? { ...item, unread: 0 } : item,
      ),
    );
    void thread(chat)
      .then((items) => {
        const sequence = newestReadSequence(items);
        if (sequence) {
          void markReadMutation({
            conversationId: chat.id,
            sequence,
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }

  function closeChat() {
    selectedRef.current = null;
    setSelected(null);
  }

  function setConversationVisible(visible: boolean) {
    setConversationVisibleState(visible);
    if (visible && selectedRef.current) {
      const items = messagesRef.current[selectedRef.current] || [];
      const sequence = newestReadSequence(items);
      if (sequence) {
        void markReadMutation({
          conversationId: selectedRef.current,
          sequence,
        }).catch(() => {});
      }
    }
  }

  const { send, retryMessage } = createRemoteSend({
    selectedRef,
    chatsRef,
    messagesRef,
    appendLocal,
    markLocalMessageStatus,
    sendText: sendTextMutation,
    sendAttachment: sendAttachmentMutation,
  });

  function react(messageId: string, emoji: string) {
    const chatId = selectedRef.current;
    if (!chatId) return;
    const current = messagesRef.current[chatId] || [];
    const message = current.find((item) => item.id === messageId);
    if (!message || message.status) return;
    updateMessages((items) => ({
      ...items,
      [chatId]: (items[chatId] || []).map((item) =>
        item.id === messageId
          ? { ...item, reaction: item.reaction === emoji ? undefined : emoji }
          : item,
      ),
    }));
    void reactionMutation({
      conversationId: chatId,
      messageId,
      reactionKey: message.reaction === emoji ? undefined : emoji,
    }).catch(() => {});
  }

  async function addContact(
    name: string,
    handle: string,
    group: boolean,
  ): Promise<Chat> {
    try {
      return await createRemoteContact(
        { name, handle, group },
        {
          createDirect,
          createGroup,
          selfId: remoteProfile?.userId,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("USERNAME_NOT_FOUND"))
        throw new Error("No account uses that username. Ask them to sign up first.");
      if (message.includes("CANNOT_CHAT_WITH_SELF"))
        throw new Error("That is your own username.");
      if (message.includes("GROUP_NEEDS_MEMBERS"))
        throw new Error("Add at least one member username for the group.");
      if (message.includes("INVALID_USERNAME"))
        throw new Error("Usernames use 3 to 30 letters, numbers, or underscores.");
      throw error;
    }
  }

  function markStorySeen(id: string) {
    setStories((current) =>
      current.map((story) =>
        story.id === id ? { ...story, seen: true } : story,
      ),
    );
    void storySeenMutation({ storyId: id as Id<"stories"> }).catch(() => {});
  }

  function deleteStory(id: string) {
    setStories((current) => current.filter((story) => story.id !== id));
    void storyDeleteMutation({ storyId: id as Id<"stories"> }).catch(() => {});
  }

  function shareStory(story: Story) {
    void uploadAndCreateStory(story, storyCreateMutation);
  }

  function saveMedia(message: Message) {
    return saveTrackedMedia(message, gallerySavedRef.current, setGallerySaved);
  }

  async function setProfile(
    next: SettingsProfile,
    options?: { remote?: boolean },
  ) {
    if (options?.remote !== false && remoteProfile) {
      await saveRemoteProfile({
        next,
        remote: remoteProfile,
        updateProfile,
        uploaded: uploadedAvatars.current,
      });
    }
    setSettings((current) => ({ ...current, ...next }));
  }

  const setTyping = useCallback(
    (typing: boolean) => {
      if (!selectedRef.current) return;
      void setTypingMutation({
        conversationId: selectedRef.current,
        typing,
      }).catch(() => {});
    },
    [setTypingMutation],
  );

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
    retryMessage,
    sendTo,
    markRead,
    react,
    deleteMessage,
    forwardMessage,
    toggleMute,
    setMuted,
    setBlocked,
    setMediaVisibility,
    toggleBlock,
    togglePin,
    clearChat,
    deleteChat,
    addContact,
    markStorySeen,
    deleteStory,
    shareStory,
    saveMedia,
    addCall: (record: RemoteCallRecord) =>
      setHistory((current) => [record, ...current]),
    thread,
    setTyping,
    conversationVisible,
  };
}
