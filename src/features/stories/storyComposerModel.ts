import type { PickedMedia } from "../media/mediaPickerModel";

export type StoryDraft = PickedMedia & {
  id: string;
  caption: string;
  crop: "fit" | "fill";
};

export const MEDIA_STORY_LIMIT = 10;

export function draftFromMedia(media: PickedMedia, seed: string): StoryDraft {
  return { ...media, id: `${seed}-${media.uri}`, caption: "", crop: "fit" };
}

export function appendDrafts(
  current: readonly StoryDraft[],
  media: readonly PickedMedia[],
  seed: string,
  limit = MEDIA_STORY_LIMIT,
): StoryDraft[] {
  const existing = new Set(current.map((item) => item.uri));
  return [
    ...current,
    ...media
      .filter((item) => !existing.has(item.uri))
      .map((item, index) => draftFromMedia(item, `${seed}-${index}`)),
  ].slice(0, limit);
}

export function removeDraft(current: readonly StoryDraft[], index: number) {
  return current.filter((_, itemIndex) => itemIndex !== index);
}

export function moveDraft(
  current: readonly StoryDraft[],
  index: number,
  direction: -1 | 1,
) {
  const target = index + direction;
  if (index < 0 || index >= current.length || target < 0 || target >= current.length) {
    return [...current];
  }
  const next = [...current];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function moveDraftTo(
  current: readonly StoryDraft[],
  from: number,
  to: number,
) {
  if (from < 0 || from >= current.length || to < 0 || to >= current.length || from === to) {
    return [...current];
  }
  const next = [...current];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function toggleDraftCrop(current: StoryDraft) {
  const crop: StoryDraft["crop"] = current.crop === "fit" ? "fill" : "fit";
  return { ...current, crop };
}
