import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

type MediaThumbnailsNative = {
  getThumbnail(source: string, size: number): Promise<string | null>;
};

const native =
  Platform.OS === "android"
    ? requireOptionalNativeModule<MediaThumbnailsNative>("MediaThumbnails")
    : null;
const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

/** True when Android can create a real, bounded-size MediaStore thumbnail. */
export const isMediaThumbnailAvailable = native !== null;

/**
 * Resolves a small cached thumbnail for a MediaStore content URI. The original
 * URI is used only when the native thumbnail module is unavailable (Expo Go,
 * web, or iOS); Android builds never fall back to decoding the full asset after
 * a thumbnail request fails.
 */
export function getMediaThumbnail(source: string, size: number) {
  if (!native) return Promise.resolve(source);
  const key = `${source}:${size}`;
  const cached = cache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;
  const request = native
    .getThumbnail(source, size)
    .catch(() => null)
    .then((uri) => {
      cache.set(key, uri);
      pending.delete(key);
      return uri;
    });
  pending.set(key, request);
  return request;
}
