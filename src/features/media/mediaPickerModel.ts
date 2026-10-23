/** Story picker rules that do not depend on the native media library. */

export const MEDIA_PICKER_LIMIT = 10;

export type MediaPickerFilter = "recents" | "photos" | "videos";

/** The part of a picked asset the editor and uploader need. */
export type PickedMedia = {
  uri: string;
  video: boolean;
  filename?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number;
};

/**
 * Adds or removes an asset while keeping the order the user selected it in.
 * The order becomes the story order, and the returned array is unchanged when
 * the selection is already full.
 */
export function toggleStorySelection(
  selected: readonly string[],
  id: string,
  limit = MEDIA_PICKER_LIMIT,
): string[] {
  if (selected.includes(id)) return selected.filter((item) => item !== id);
  if (selected.length >= limit) return [...selected];
  return [...selected, id];
}

/** The 1-based badge number for an asset, or 0 when it is not selected. */
export function mediaSelectionOrder(
  selected: readonly string[],
  id: string,
): number {
  const index = selected.indexOf(id);
  return index < 0 ? 0 : index + 1;
}

/** Video lengths use the same m:ss shape as the rest of the app. */
export function formatMediaDuration(durationMs: number | null | undefined) {
  if (!durationMs || durationMs <= 0) return "";
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Appends a page without letting media-store offset drift create duplicates. */
export function appendUniqueMediaAssets<T extends { id: string }>(
  current: readonly T[],
  next: readonly T[],
): T[] {
  const seen = new Set(current.map((item) => item.id));
  const appended: T[] = [];
  for (const item of next) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    appended.push(item);
  }
  return [...current, ...appended];
}
