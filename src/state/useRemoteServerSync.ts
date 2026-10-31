import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { Chat, Message, Story } from "../domain/data";
import { markOwnStories } from "../domain/stories";
import { messengerRepository } from "../data/messengerRepository";
import { prefetchStories } from "../services/mediaCache";
import { mapStory } from "./remoteMessengerTypes";
import {
  mergeConversations,
  type RemoteConversation,
  type RemotePreference,
} from "./conversationSync";

type RemoteStory = Parameters<typeof mapStory>[0];

/**
 * Re-reads the conversations a relay drain changed. The drain commits to
 * SQLite itself, so the stored thread is authoritative: it also carries the
 * outbox rows for sends that have not been confirmed, and a delete has already
 * removed its row there.
 */
export function syncRelayRows(
  chatIds: string[],
  setMessages: Dispatch<SetStateAction<Record<string, Message[]>>>,
  setCachedChats: Dispatch<SetStateAction<Chat[]>>,
) {
  for (const chatId of chatIds) {
    void messengerRepository
      .loadMessages(chatId)
      .then((stored) => {
        setMessages((current) => ({
          ...current,
          [chatId]: stored || [],
        }));
      })
      .catch(() => {});
  }
  void messengerRepository
    .loadChats()
    .then((stored) => {
      if (!stored) return;
      // The stored row owns the preview, time and unread count, but a chat the
      // inbox has not named yet would otherwise lose the name and avatar the
      // server already told us. Keep that identity until `saveChats` rewrites
      // the row.
      setCachedChats((current) => {
        const known = new Map(current.map((chat) => [chat.id, chat]));
        return stored.map((chat) => {
          const previous = known.get(chat.id);
          if (!previous) return chat;
          return {
            ...chat,
            name: chat.name || previous.name,
            avatar: chat.avatar || previous.avatar,
            username: chat.username ?? previous.username,
            bio: chat.bio ?? previous.bio,
          };
        });
      });
    })
    .catch(() => {});
}

type Args = {
  remoteChats: RemoteConversation[] | undefined;
  remotePreferences: RemotePreference[] | undefined;
  remoteStories: RemoteStory[] | undefined;
  selfId?: string;
  chatsRef: MutableRefObject<Chat[]>;
  storiesRef: MutableRefObject<Story[]>;
  setCachedChats: Dispatch<SetStateAction<Chat[]>>;
  setStories: Dispatch<SetStateAction<Story[]>>;
};

/**
 * Copies live Convex data into the device cache and prefetches the first few
 * story images. Conversations only contribute identity and membership: the
 * preview, the unread count and the order stay local, because the phone owns
 * the history.
 */
export function useRemoteServerSync({
  remoteChats,
  remotePreferences,
  remoteStories,
  selfId,
  chatsRef,
  storiesRef,
  setCachedChats,
  setStories,
}: Args) {
  useEffect(() => {
    if (!remoteChats || !remotePreferences) return;
    const next = mergeConversations(
      remoteChats,
      remotePreferences,
      chatsRef.current,
      selfId,
    );
    chatsRef.current = next;
    setCachedChats(next);
    void messengerRepository.saveChats(next).catch(() => {});
  }, [chatsRef, remoteChats, remotePreferences, selfId, setCachedChats]);

  useEffect(() => {
    if (!remoteStories) return;
    let active = true;
    const now = Date.now();
    const next = markOwnStories(
      remoteStories
        .map(mapStory)
        .filter((story) => !story.expiresAt || story.expiresAt > now),
      selfId,
    );
    storiesRef.current = next;
    setStories(next);
    void messengerRepository.saveStories(next).catch(() => {});
    void prefetchStories(next, 8)
      .then((cached) => {
        if (!active) return;
        storiesRef.current = cached;
        setStories(cached);
        return messengerRepository.saveStories(cached);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [remoteStories, selfId, setStories, storiesRef]);
}
