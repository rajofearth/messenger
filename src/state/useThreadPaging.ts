import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { api } from "../../convex/_generated/api";
import type { Message } from "../domain/data";
import { mergeOlderPage } from "../domain/threadMerge";
import { messengerRepository } from "../data/messengerRepository";
import { convexClient } from "../services/convexClient";
import { loadOlderThread } from "./loadOlderThread";
import { mapMessage } from "./remoteMessengerTypes";

type Args = {
  selected: string | null;
  /** The open thread's own server page; its `hasMore` seeds the control. */
  remoteHasMore?: boolean;
  selectedRef: MutableRefObject<string | null>;
  messagesRef: MutableRefObject<Record<string, Message[]>>;
  updateMessages: (
    next: (current: Record<string, Message[]>) => Record<string, Message[]>,
  ) => void;
};

/**
 * "Load older" for the open conversation.
 *
 * The phone's database answers first; the server is only asked for rows this
 * device never received. The server's raw cursor is what tells an empty page
 * caused by per-user deletes apart from the actual start of the thread.
 */
export function useThreadPaging({
  selected,
  remoteHasMore,
  selectedRef,
  messagesRef,
  updateMessages,
}: Args) {
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadOlderFailed, setLoadOlderFailed] = useState(false);
  const loadingOlderRef = useRef(false);
  // Bumped on every reset/refresh so a page from another chat, or a stale
  // local read, cannot write to the thread that is open now.
  const generation = useRef(0);

  /**
   * Re-derives the control: the server page's `hasMore` when this render has
   * it, otherwise the local thread flag. Called on open, when the query
   * answers, and once the head page is durable.
   */
  const refresh = useCallback(
    (chatId: string, seed?: boolean) => {
      const run = (generation.current += 1);
      if (selectedRef.current !== chatId) return;
      if (seed !== undefined) {
        // The head page already knows whether the server holds older rows; the
        // local flag is only a fallback for when that page is not here yet.
        setHasOlder(seed);
        return;
      }
      void messengerRepository
        .threadHasOlder(chatId)
        .then((older) => {
          if (generation.current !== run) return;
          if (selectedRef.current === chatId) setHasOlder(older);
        })
        .catch(() => {});
    },
    [selectedRef],
  );

  useEffect(() => {
    if (!selected) return;
    refresh(selected, remoteHasMore);
  }, [refresh, remoteHasMore, selected]);

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
    // Nothing confirmed yet: the head page has not painted. Leave `hasOlder`
    // alone so a scroll after the page arrives can still load history.
    if (!current.some((message) => message.sequence !== undefined)) return;
    const run = generation.current;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    setLoadOlderFailed(false);
    try {
      const page = await loadOlderThread({
        messages: current,
        readLocal: (beforeSequence) =>
          messengerRepository.loadOlderMessages(chatId, beforeSequence),
        readRemote: async (beforeSequence, limit) => {
          const remote = await convexClient.query(api.chat.listMessages, {
            conversationId: chatId,
            beforeSequence,
            limit,
          });
          return {
            rows: remote.messages.map(mapMessage),
            hasMore: remote.hasMore,
            nextBeforeSequence: remote.nextBeforeSequence,
          };
        },
        canReadRemote: () => messengerRepository.threadHasOlder(chatId),
        save: (rows) => messengerRepository.saveMessages(chatId, rows),
        markExhausted: () => messengerRepository.markThreadExhausted(chatId),
      });
      if (selectedRef.current !== chatId) return;
      setHasOlder(page.hasMore);
      setLoadOlderFailed(page.failed === true);
      if (!page.rows.length) return;
      updateMessages((current) => ({
        ...current,
        [chatId]: mergeOlderPage(page.rows, current[chatId] ?? []),
      }));
    } catch {
      // The disk page was already painted by the caller's rows; keep the
      // control and let the reader retry instead of hiding history.
      if (selectedRef.current === chatId) setLoadOlderFailed(true);
    } finally {
      // A reset already cleared the spinner and the ref for the next chat; a
      // refresh on this same chat must not leave either stuck on.
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
