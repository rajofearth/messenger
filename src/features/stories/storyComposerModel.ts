import type { PickedMedia } from "../media/mediaPickerModel";

export type StoryDraft = PickedMedia & {
  id: string;
  caption: string;
  crop: "fit" | "fill";
};

export function draftFromMedia(media: PickedMedia, seed: string): StoryDraft {
  return { ...media, id: `${seed}-${media.uri}`, caption: "", crop: "fit" };
}

export function appendDrafts(
  current: readonly StoryDraft[],
  media: readonly PickedMedia[],
  seed: string,
): StoryDraft[] {
  const existing = new Set(current.map((item) => item.uri));
  return [
    ...current,
    ...media
      .filter((item) => !existing.has(item.uri))
      .map((item, index) => draftFromMedia(item, `${seed}-${index}`)),
  ];
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

export function toggleDraftCrop(current: StoryDraft) {
  const crop: StoryDraft["crop"] = current.crop === "fit" ? "fill" : "fit";
  return { ...current, crop };
}
