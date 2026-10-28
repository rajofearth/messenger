import type { Message } from "../domain/data";

/** Raw server pages one "load older" may walk while every row is hidden. */
export const OLDER_HIDDEN_PAGE_BUDGET = 4;

export type OlderServerPage = {
  rows: Message[];
  hasMore: boolean;
  /** True when the hidden-page budget, not the server, stopped the walk. */
  exhaustedByBudget?: boolean;
};

export type RemoteOlderPage = {
  /** Rows that survived the server's per-user delete/clear filter. */
  rows: Message[];
  /** Whether the raw page was full, so the server may hold older rows. */
  hasMore: boolean;
  /** Raw page cursor for the next request, supplied only when `hasMore`. */
  nextBeforeSequence?: number;
};

/** The oldest confirmed sequence, which is the cursor for older rows. */
export function oldestConfirmedSequence(
  messages: Message[],
): number | undefined {
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
 * Reads older server pages until one has visible rows or the history ends.
 *
 * The server computes `hasMore`/`nextBeforeSequence` from the raw page, so a
 * page that a delete-for-me or a clear hid entirely still carries the cursor
 * for the next one. Following that cursor is what stops the client asking for
 * the same page forever. A short visible page is not the end: only a page that
 * was not full reports `hasMore: false`.
 *
 * A run of fully hidden pages means the user hid that range on purpose, so the
 * walk stops after a few pages rather than looping. That stop is not proof from
 * the server, so the caller keeps the control and can continue later.
 */
export async function readOlderServerPages({
  beforeSequence,
  limit,
  fetchPage,
  maxHiddenPages = OLDER_HIDDEN_PAGE_BUDGET,
}: {
  beforeSequence: number;
  limit: number;
  fetchPage: (
    beforeSequence: number,
    limit: number,
  ) => Promise<RemoteOlderPage>;
  maxHiddenPages?: number;
}): Promise<OlderServerPage> {
  let cursor = beforeSequence;
  for (let attempt = 0; attempt < maxHiddenPages; attempt += 1) {
    const page = await fetchPage(cursor, limit);
    if (page.rows.length > 0) {
      return { rows: page.rows, hasMore: page.hasMore };
    }
    if (!page.hasMore) return { rows: [], hasMore: false };
    // A cursor that cannot move would repeat this page forever.
    if (
      page.nextBeforeSequence === undefined ||
      page.nextBeforeSequence === cursor ||
      page.nextBeforeSequence >= cursor
    ) {
      return { rows: [], hasMore: false };
    }
    cursor = page.nextBeforeSequence;
  }
  // The budget ran out, so the server may still hold rows. Never report this
  // as the end of the thread.
  return { rows: [], hasMore: true, exhaustedByBudget: true };
}
