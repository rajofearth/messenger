import type { Message } from "../domain/data";
import { mergeOlderPage } from "../domain/threadMerge";
import {
  oldestConfirmedSequence,
  readOlderServerPages,
  type OlderServerPage,
  type RemoteOlderPage,
} from "./threadPaging";

export const OLDER_PAGE_SIZE = 100;

export type OlderThreadPage = {
  rows: Message[];
  hasMore: boolean;
  /** The server read failed; the disk page stands and a tap can retry. */
  failed?: boolean;
};

/**
 * Loads one page of history older than what the screen already holds.
 *
 * The phone is the durable copy, so the local database answers first: a full
 * local page means older rows are already on disk and no network is needed. A
 * short local page is the end of the local history, so the server is asked for
 * the rows this device never received (a fresh install, a restore, or a thread
 * that migrated from the old newest-100 cache).
 *
 * Confirmed server rows are saved before they reach the screen, so killing the
 * app right after a page arrives keeps it. The save uses the merged page so a
 * `file://` original this device already downloaded survives the server copy.
 * Only the server can prove the history ended; a failed request or the hidden
 * page budget is never treated as the end.
 */
export async function loadOlderThread({
  messages,
  readLocal,
  readRemote,
  canReadRemote,
  save,
  markExhausted,
  limit = OLDER_PAGE_SIZE,
}: {
  /** The thread as currently shown, confirmed and optimistic rows together. */
  messages: Message[];
  readLocal: (beforeSequence: number, limit: number) => Promise<Message[]>;
  readRemote: (
    beforeSequence: number,
    limit: number,
  ) => Promise<RemoteOlderPage>;
  /** False once the server is known to hold nothing older. */
  canReadRemote: () => Promise<boolean>;
  save: (rows: Message[]) => Promise<void>;
  markExhausted: () => Promise<void>;
  limit?: number;
}): Promise<OlderThreadPage> {
  const oldest = oldestConfirmedSequence(messages);
  // Nothing confirmed to page from; an optimistic-only thread has no history.
  if (oldest === undefined) return { rows: [], hasMore: false };

  const local = await readLocal(oldest, limit);
  if (local.length >= limit) {
    // A full page stops at sequence 1 only when the whole thread is local.
    const next = oldestConfirmedSequence(local);
    return { rows: local, hasMore: next !== undefined && next > 1 };
  }

  if (!(await canReadRemote())) return { rows: local, hasMore: false };

  let page: OlderServerPage;
  try {
    page = await readOlderServerPages({
      beforeSequence: oldest,
      limit,
      fetchPage: readRemote,
    });
  } catch {
    // Offline or the request failed. The rows already on disk still belong on
    // screen, and the control has to stay so the next tap can retry.
    return { rows: local, hasMore: true, failed: true };
  }

  if (page.exhaustedByBudget) {
    // A wide delete-for-me range ran out the hidden-page budget; the server has
    // not said the history ended, so nothing is marked exhausted.
    return { rows: local, hasMore: true };
  }
  if (!page.rows.length) {
    if (!page.hasMore) await markExhausted();
    return { rows: local, hasMore: page.hasMore };
  }

  // A row can be both on disk and in the server page; retain local media while
  // letting the fetched server row provide the current message fields.
  const rows = mergeOlderPage(page.rows, local);
  await save(rows);
  if (!page.hasMore) await markExhausted();
  return { rows, hasMore: page.hasMore };
}
