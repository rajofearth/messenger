import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { Chat, Message, Story } from "../domain/data";
import { markOwnStories } from "../domain/stories";
import { mergeChats, mergeThread } from "../domain/threadMerge";
import { messengerRepository } from "../data/messengerRepository";
import { prefetchStories } from "../services/mediaCache";
import { mapChat, mapStory } from "./remoteMessengerTypes";

type RemoteChat = Parameters<typeof mapChat>[0];
type RemoteStory = Parameters<typeof mapStory>[0];

/**
 * A relayed conversation has no component rows, so an inbox snapshot can be
 * older than the phone copy or not mention the conversation at all. A server
 * row replaces the cache only when its last message is at least as new; an
 * unknown conversation is left untouched. Component conversations keep the
 * pending-preview rule in mergeChats.
 */
function mergeInbox(server: Chat[], cached: Chat[]): Chat[] {
  const cachedById = new Map(cached.map((chat) => [chat.id, chat]));
  const known = new Set<string>();
  const merged = server.map((chat) => {
    known.add(chat.id);
    const current = cachedById.get(chat.id);
    if (!current) return chat;
    const serverAt = chat.lastMessageAt ?? 0;
    const localAt = current.lastMessageAt ?? 0;
    if (serverAt < localAt) return current;
    return mergeChats([chat], [current])[0];
  });
  // A conversation missing from the server list may still be local history.
  return [...merged, ...cached.filter((chat) => !known.has(chat.id))];
}

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
      if (stored) setCachedChats(stored);
    })
    .catch(() => {});
}

type Args = {
  remoteChats: RemoteChat[] | undefined;
  remoteStories: RemoteStory[] | undefined;
  remoteThread: Message[] | undefined;
  selected: string | null;
  conversationVisible: boolean;
  selfId?: string;
  chatsRef: MutableRefObject<Chat[]>;
  storiesRef: MutableRefObject<Story[]>;
  setCachedChats: Dispatch<SetStateAction<Chat[]>>;
  setStories: Dispatch<SetStateAction<Story[]>>;
  setMessages: Dispatch<SetStateAction<Record<string, Message[]>>>;
  markReadThrough: (args: {
    conversationId: string;
    sequence: number;
  }) => Promise<unknown>;
};

/**
 * Copies live Convex data into the device cache and prefetches the first few
 * story images. A thread that has never been opened falls back to its disk
 * copy until the network query answers.
 */
export function useRemoteServerSync({
  remoteChats,
  remoteStories,
  remoteThread,
  selected,
  conversationVisible,
  selfId,
  chatsRef,
  storiesRef,
  setCachedChats,
  setStories,
  setMessages,
  markReadThrough,
}: Args) {
  const lastRead = useRef<string | null>(null);

  useEffect(() => {
    if (!selected || !conversationVisible || !remoteThread) return;
    const sequence = remoteThread[remoteThread.length - 1]?.sequence;
    if (!sequence) return;
    const marker = `${selected}:${sequence}`;
    if (lastRead.current === marker) return;
    lastRead.current = marker;
    setCachedChats((current) =>
      current.map((item) =>
        item.id === selected ? { ...item, unread: 0 } : item,
      ),
    );
    void markReadThrough({ conversationId: selected, sequence }).catch(() => {});
  }, [
    conversationVisible,
    markReadThrough,
    remoteThread,
    selected,
    setCachedChats,
  ]);

  useEffect(() => {
    if (!remoteChats) return;
    // Save the merged view, not the raw server page: a stale component row
    // must not put an older preview back on disk over a relayed message.
    const confirmed = remoteChats.map(mapChat);
    const next = mergeInbox(confirmed, chatsRef.current);
    chatsRef.current = next;
    setCachedChats(next);
    void messengerRepository.saveChats(next).catch(() => {});
  }, [chatsRef, remoteChats, setCachedChats]);

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

  useEffect(() => {
    if (!selected) return;
    let active = true;
    void messengerRepository
      .loadMessages(selected)
      .then((stored) => {
        if (!active || remoteThread) return;
        // The disk copy holds confirmed rows only; merge so the outbox bubbles
        // hydrated at startup stay on screen while the network is away.
        setMessages((current) => ({
          ...current,
          [selected]: mergeThread(stored || [], current[selected] || []),
        }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [remoteThread, selected, setMessages]);
}
