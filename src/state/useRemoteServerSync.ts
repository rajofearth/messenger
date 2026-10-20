import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { Chat, Message, Story } from "../domain/data";
import { messengerRepository } from "../data/messengerRepository";
import { prefetchStories } from "../services/mediaCache";
import { mapChat, mapStory } from "./remoteMessengerTypes";

type RemoteChat = Parameters<typeof mapChat>[0];
type RemoteStory = Parameters<typeof mapStory>[0];

type Args = {
  remoteChats: RemoteChat[] | undefined;
  remoteStories: RemoteStory[] | undefined;
  remoteThread: Message[] | undefined;
  selected: string | null;
  conversationVisible: boolean;
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
    const next = remoteChats.map(mapChat);
    chatsRef.current = next;
    setCachedChats(next);
    void messengerRepository.saveChats(next).catch(() => {});
  }, [chatsRef, remoteChats, setCachedChats]);

  useEffect(() => {
    if (!remoteStories) return;
    const now = Date.now();
    const next = remoteStories
      .map(mapStory)
      .filter((story) => !story.expiresAt || story.expiresAt > now);
    storiesRef.current = next;
    setStories(next);
    void messengerRepository.saveStories(next).catch(() => {});
    void prefetchStories(next, 8)
      .then((cached) => {
        storiesRef.current = cached;
        setStories(cached);
        return messengerRepository.saveStories(cached);
      })
      .catch(() => {});
  }, [remoteStories, setStories, storiesRef]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    void messengerRepository
      .loadMessages(selected)
      .then((stored) => {
        if (!active || remoteThread) return;
        setMessages((current) => ({ ...current, [selected]: stored || [] }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [remoteThread, selected, setMessages]);
}
