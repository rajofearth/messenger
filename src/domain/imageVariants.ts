/**
 * Shared sizing rules for image variants.
 *
 * Photos arrive at full resolution, but every screen that shows one renders it
 * at a fraction of that size. These helpers decide which stored widths are
 * worth generating and which one a view should ask for, using the same 2x
 * device-pixel cap that Next.js applies to image sources.
 */

import { cacheKey } from "../data/cache";
import type { ImageVariant } from "./data";

/** Stored widths, smallest first. A source narrower than a width is never upscaled. */
export const IMAGE_VARIANT_WIDTHS = [256, 512, 1080] as const;

/**
 * Widths worth generating for a source, ascending and no wider than it. A rung
 * equal to the source is kept: a 1080px photo needs a 1080px variant for a
 * full-screen view, and re-encoding it loses no resolution.
 */
export function variantWidths(sourceWidth: number): number[] {
  return IMAGE_VARIANT_WIDTHS.filter((width) => width <= sourceWidth);
}

/**
 * The smallest variant that still covers `targetPx`, or the largest when none
 * does. An empty list has no variant to pick.
 */
export function pickImageVariant<T extends { width: number }>(
  variants: readonly T[],
  targetPx: number,
): T | undefined {
  let smallest: T | undefined;
  let largest: T | undefined;
  for (const variant of variants) {
    if (!largest || variant.width > largest.width) largest = variant;
    if (variant.width >= targetPx && (!smallest || variant.width < smallest.width))
      smallest = variant;
  }
  return smallest ?? largest;
}

/**
 * Device pixels to fetch for a view: its width at the device density, capped at
 * 2x so a high-density phone does not download a needlessly huge image.
 */
export function targetPixels(displayWidthDp: number, density: number): number {
  const ratio = Math.min(Math.max(Number.isFinite(density) ? density : 1, 1), 2);
  const width = Number.isFinite(displayWidthDp)
    ? Math.max(0, displayWidthDp)
    : 0;
  return Math.ceil(width * ratio);
}

const storagePath = /\/api\/storage\/([^/?#]+)/i;
const remote = /^https?:\/\//i;

/** The Convex storage id in a URL, ignoring its query string and fragment. */
export function storageIdFromUrl(uri: string): string | undefined {
  return storagePath.exec(uri)?.[1];
}

/**
 * A stable key for an image source. Convex hands out a new signed URL for the
 * same storage object on every query, so the storage id is the identity that
 * matters; other remote URLs fall back to a hash of the whole URL. Local files
 * do not need a cache key.
 */
export function imageCacheKey(uri: string): string | undefined {
  if (!remote.test(uri)) return undefined;
  const id = storageIdFromUrl(uri);
  return id ? `storage-${id}` : cacheKey(uri);
}

export function variantName(width: number): string {
  return `w${width}`;
}

/** What one image surface should load, and the cache key a remote URI needs. */
export type ImageSourceChoice = {
  kind: "local" | "variant" | "original";
  uri: string;
  /** Chosen variant width and name, when kind === "variant". */
  width?: number;
  name?: string;
  mimeType?: string;
  /** expo-image cache key for a remote URI. */
  cacheKey?: string;
};

const local = /^(?:file|content|asset|data):/i;

/**
 * The source a view should ask for. A local file is authoritative: it is
 * already downloaded, and an original may be needed for a gallery save. Remote
 * images take the smallest variant that covers the view at its 2x density,
 * falling back to the original when no variant covers it or when the variant
 * would widen a smaller source. An already-downloaded preview is reused only
 * when it is at least as wide as the chosen variant.
 */
export function chooseImageSource(input: {
  uri?: string;
  variants?: readonly ImageVariant[];
  /** Original image width in pixels, when known. */
  sourceWidth?: number;
  /** Display slot width in dp. */
  displayWidth: number;
  density: number;
  /** A local file already downloaded for one width. */
  preview?: { uri: string; width: number };
}): ImageSourceChoice | undefined {
  const { uri, variants, sourceWidth, displayWidth, density, preview } = input;
  if (!uri) return undefined;
  if (local.test(uri)) return { kind: "local", uri };
  const target = targetPixels(displayWidth, density);
  let choice: ImageSourceChoice = { kind: "original", uri };
  if (variants && variants.length > 0) {
    const picked = pickImageVariant(variants, target);
    if (picked) {
      const covers = picked.width >= target;
      const matchesSource =
        sourceWidth !== undefined && sourceWidth <= picked.width;
      if (covers || matchesSource) {
        choice = {
          kind: "variant",
          uri: picked.uri,
          width: picked.width,
          name: picked.name,
          mimeType: picked.mimeType,
        };
      }
    }
  }
  if (choice.kind === "variant") {
    if (preview && preview.width >= (choice.width ?? 0)) {
      return { kind: "local", uri: preview.uri };
    }
  }
  return { ...choice, cacheKey: imageCacheKey(choice.uri) };
}
