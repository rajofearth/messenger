import type { PickedMedia } from "./mediaPickerModel";
import { resolvePickedMedia } from "./resolvePickedMedia";
import { cachePickedMedia } from "../../services/mediaCache";

export async function prepareCameraCapture(
  media: PickedMedia,
  selection: readonly string[],
  append: boolean,
  limit: number,
) {
  const cached = await cachePickedMedia(media, `camera-${Date.now().toString(36)}`);
  if (!append) return { media: [cached], full: false };
  if (selection.length >= limit) return { media: null, full: true };
  const selected = await resolvePickedMedia(selection);
  return { media: [...selected, cached], full: false };
}
