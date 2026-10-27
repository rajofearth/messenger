import { useRef, useState, type MutableRefObject } from "react";
import { api } from "../../convex/_generated/api";
import type { Message } from "../domain/data";
import { mergeOlderPage } from "../domain/threadMerge";
import { messengerRepository } from "../data/messengerRepository";
import { convexClient } from "../services/convexClient";
import { loadOlderThread } from "./loadOlderThread";
import { mapMessage } from "./remoteMessengerTypes";

type Args = {
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
  selectedRef,
  messagesRef,
  updateMessages,
}: Args) {
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);

  /** Called when a thread opens; the previous chat's flag must not leak. */
  function refresh(chatId: string) {
    void messengerRepository
      .threadHasOlder(chatId)
      .then((older) => {
        if (selectedRef.current === chatId) setHasOlder(older);
      })
      .catch(() => {});
  }

  function reset() {
    setHasOlder(false);
  }

  async function loadOlder() {
    const chatId = selectedRef.current;
    if (!chatId || loadingOlderRef.current) return;
    const current = messagesRef.current[chatId] ?? [];
    // Nothing confirmed yet: the head page has not painted. Leave `hasOlder`
    // alone so a scroll after the page arrives can still load history.
    if (!current.some((message) => message.sequence !== undefined)) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
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
      if (selectedRef.current === chatId) setHasOlder(page.hasMore);
      if (!page.rows.length) return;
      updateMessages((current) => ({
        ...current,
        [chatId]: mergeOlderPage(page.rows, current[chatId] ?? []),
      }));
    } catch {
      // Keep the control so the next scroll to the top can try again.
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }

  return { hasOlder, loadingOlder, loadOlder, refresh, reset };
}
