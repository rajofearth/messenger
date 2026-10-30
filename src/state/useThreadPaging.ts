import { useCallback, useRef, useState, type MutableRefObject } from "react";
import type { Message } from "../domain/data";
import { mergeOlderPage } from "../domain/threadMerge";
import { messengerRepository } from "../data/messengerRepository";

type Args = {
  selectedRef: MutableRefObject<string | null>;
  messagesRef: MutableRefObject<Record<string, Message[]>>;
  updateMessages: (
    next: (current: Record<string, Message[]>) => Record<string, Message[]>,
  ) => void;
};

/** The oldest confirmed sequence in the open thread, or undefined. */
function oldestSequence(messages: readonly Message[]): number | undefined {
  let oldest: number | undefined;
  for (const message of messages) {
    if (message.sequence === undefined) continue;
    if (oldest === undefined || message.sequence < oldest) {
      oldest = message.sequence;
    }
  }
  return oldest;
}

/**
 * "Load older" reads the phone's own database: the relay keeps no history, so
 * every row this device ever received is already here. The repository answers
 * one page plus whether anything before it exists, so no extra probe is needed.
 */
export function useThreadPaging({
  selectedRef,
  messagesRef,
  updateMessages,
}: Args) {
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadOlderFailed, setLoadOlderFailed] = useState(false);
  const loadingOlderRef = useRef(false);
  // Bumped on every reset/refresh so a page from another chat, or a stale read,
  // cannot write to the thread that is open now.
  const generation = useRef(0);

  /** Re-derives the control from the loaded page's oldest sequence. */
  const refresh = useCallback(
    (chatId: string) => {
      const run = (generation.current += 1);
      if (selectedRef.current !== chatId) return;
      const oldest = oldestSequence(messagesRef.current[chatId] ?? []);
      if (oldest === undefined) {
        setHasOlder(false);
        return;
      }
      void messengerRepository
        .hasOlderMessages(chatId, oldest)
        .then((older) => {
          if (generation.current !== run) return;
          if (selectedRef.current === chatId) setHasOlder(older);
        })
        .catch(() => {});
    },
    [messagesRef, selectedRef],
  );

  const reset = useCallback(() => {
    generation.current += 1;
    loadingOlderRef.current = false;
    setHasOlder(false);
    setLoadingOlder(false);
    setLoadOlderFailed(false);
  }, []);

  const loadOlder = useCallback(async () => {
    const chatId = selectedRef.current;
    if (!chatId || loadingOlderRef.current) return;
    const current = messagesRef.current[chatId] ?? [];
    const oldest = oldestSequence(current);
    if (oldest === undefined) return;
    const run = generation.current;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    setLoadOlderFailed(false);
    try {
      const page = await messengerRepository.loadOlderMessages(chatId, oldest);
      if (selectedRef.current !== chatId) return;
      setHasOlder(page.hasMore);
      if (!page.messages.length) return;
      updateMessages((messages) => ({
        ...messages,
        [chatId]: mergeOlderPage(page.messages, messages[chatId] ?? []),
      }));
    } catch {
      if (selectedRef.current === chatId) setLoadOlderFailed(true);
    } finally {
      if (generation.current === run || selectedRef.current === chatId) {
        loadingOlderRef.current = false;
        setLoadingOlder(false);
      }
    }
  }, [messagesRef, selectedRef, updateMessages]);

  return {
    hasOlder,
    loadingOlder,
    loadOlderFailed,
    loadOlder,
    refresh,
    reset,
  };
}
