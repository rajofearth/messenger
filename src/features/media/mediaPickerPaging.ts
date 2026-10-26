/**
 * Pure pagination rules for the media picker.
 *
 * The picker reads the device media store directly, so a page can be requested
 * while the store is still changing. An offset into that list is not stable:
 * inserting or deleting one row moves every row after it, and the old code
 * advanced by `assets.length`, so a page boundary could silently skip rows.
 * These helpers page by the modification timestamp of the last visible asset
 * instead. The next query re-reads that whole timestamp (`lte`, inclusive) and
 * duplicate ids are dropped afterwards, which makes a page boundary
 * independent of how many rows were added or removed above it.
 */
import type { AssetMetadata } from "expo-media-library";

/** One row past the page is requested so the last page needs no count query. */
export const MEDIA_PAGE_SIZE = 60;

export type MediaPageWindow =
  | { mode: "cursor"; cursor: number | null; limit: number }
  | { mode: "offset"; offset: number; limit: number };

/**
 * Builds the request for the page after `loaded` (newest first).
 *
 * The cursor is the oldest modification time on screen. Rows that share it are
 * counted and added to the limit, because the inclusive cursor returns them
 * again. A page that still adds nothing after that has reached the dated tail
 * of the library; only then does the picker fall back to an offset, which is
 * needed for rows without a modification timestamp (SQLite sorts those after
 * every dated row, where a time cursor cannot reach them).
 */
export function nextMediaPageWindow(
  loaded: readonly AssetMetadata[],
  pageSize = MEDIA_PAGE_SIZE,
): MediaPageWindow {
  const last = loaded[loaded.length - 1];
  if (!last) return { mode: "cursor", cursor: null, limit: pageSize + 1 };
  if (last.modificationTime === null) {
    return { mode: "offset", offset: loaded.length, limit: pageSize + 1 };
  }
  let atCursor = 0;
  for (const asset of loaded) {
    if (asset.modificationTime === last.modificationTime) atCursor += 1;
  }
  return {
    mode: "cursor",
    cursor: last.modificationTime,
    limit: pageSize + atCursor + 1,
  };
}

/**
 * Appends the new rows of `page`, preserving the store order and never
 * repeating an id. `added` is how many rows the page contributed, which lets
 * the caller notice an exhausted cursor and try the undated tail.
 */
export function mergeMediaPage(
  loaded: readonly AssetMetadata[],
  page: readonly AssetMetadata[],
  pageSize = MEDIA_PAGE_SIZE,
): { assets: AssetMetadata[]; added: number; hasMore: boolean } {
  const seen = new Set(loaded.map((asset) => asset.id));
  const fresh: AssetMetadata[] = [];
  for (const asset of page) {
    if (seen.has(asset.id)) continue;
    seen.add(asset.id);
    fresh.push(asset);
  }
  const added = Math.min(fresh.length, pageSize);
  return {
    assets: added ? [...loaded, ...fresh.slice(0, pageSize)] : [...loaded],
    added,
    hasMore: fresh.length > pageSize,
  };
}
