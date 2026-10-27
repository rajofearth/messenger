/**
 * Paging metadata for a backwards thread query.
 *
 * `chat.listMessages` applies per-user visibility rules (delete-for-me rows and
 * `clearedThrough`) after reading a page from the component. A page can be
 * short or empty because everything on it was hidden, which looks exactly like
 * the end of the history to a client. The cursor is therefore derived from the
 * raw page, before the filter, so "load older" can always tell the two apart.
 */

export const MESSAGE_PAGE_DEFAULT = 100;
/** The public query accepts a page of at most this many rows. */
export const MESSAGE_PAGE_MAX = 200;
/** `convex-chat` rejects a page larger than 100, so that is the hard cap. */
export const CHAT_COMPONENT_PAGE_MAX = 100;

/** Coerces a caller limit to a whole number from 1 to `MESSAGE_PAGE_MAX`. */
export function messagePageSize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return MESSAGE_PAGE_DEFAULT;
  }
  return Math.min(Math.max(Math.trunc(value), 1), MESSAGE_PAGE_MAX);
}

/**
 * Whether older rows exist, and the cursor for them, from the raw component
 * page. A full page means there may be more; the oldest raw sequence becomes
 * the next cursor. Sequences start at 1, so paging stops there, and a cursor
 * never repeats the one that produced this page.
 *
 * `rawCount` and `oldestSequence` must describe the page as the component
 * returned it, not the rows that survived the per-user filter.
 */
export function messagePageMeta({
  rawCount,
  limit,
  oldestSequence,
  beforeSequence,
}: {
  rawCount: number;
  limit: number;
  oldestSequence?: number;
  beforeSequence?: number;
}): { hasMore: boolean; nextBeforeSequence?: number } {
  const full = limit > 0 && rawCount === limit;
  const usableCursor =
    oldestSequence !== undefined &&
    Number.isSafeInteger(oldestSequence) &&
    oldestSequence > 1 &&
    oldestSequence !== beforeSequence;
  const hasMore = full && usableCursor;
  return {
    hasMore,
    nextBeforeSequence: hasMore ? oldestSequence : undefined,
  };
}
