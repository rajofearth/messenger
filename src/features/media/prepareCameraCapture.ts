import type { PickedMedia } from "./mediaPickerModel";
import { resolvePickedMedia } from "./resolvePickedMedia";
import {
  cachePickedMedia,
  discardTemporaryMedia,
} from "../../services/mediaCache";

export async function prepareCameraCapture(
  media: PickedMedia,
  selection: readonly string[],
  append: boolean,
  limit: number,
) {
  const cached = await cachePickedMedia(media, `camera-${Date.now().toString(36)}`);
  if (!append) return { media: [cached], full: false };
  if (selection.length >= limit) {
    discardTemporaryMedia(cached.uri);
    return { media: null, full: true };
  }
  try {
    const selected = await resolvePickedMedia(selection);
    return { media: [...selected, cached], full: false };
  } catch (error) {
    discardTemporaryMedia(cached.uri);
    throw error;
  }
}
