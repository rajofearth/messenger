/**
 * Native image preparation for uploads.
 *
 * Photos are stored once at full resolution and then displayed at avatar sizes
 * in dozens of places. Resizing before upload keeps the bytes small and gives
 * every caller a predictable width. Both helpers fail closed: the original
 * file is always a usable fallback, so a failed transformation is never fatal.
 */

import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { variantName, variantWidths } from "../domain/imageVariants";

const AVATAR_WIDTH = 512;
const AVATAR_QUALITY = 0.82;
/** Upload cap for photos: enough for a full-screen phone view at 2x. */
export const PHOTO_MAX_WIDTH = 1600;
export const PHOTO_QUALITY = 0.8;
/** Stories are full-bleed, so they keep a little more detail. */
export const STORY_MAX_WIDTH = 1920;
export const STORY_QUALITY = 0.82;

export type PreparedImageVariant = {
  name: string;
  uri: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: string;
};

/**
 * A picked photo re-encoded for upload plus the widths a remote view may ask
 * for. The original file is never modified.
 */
export type PreparedPhotoUpload = {
  /** The blob to upload instead of the original. */
  uri: string;
  mimeType: string;
  filename: string;
  width: number;
  height: number;
  bytes: number;
  variants: PreparedImageVariant[];
};

export type PreparedAvatar = {
  uri: string;
  mimeType: string;
  filename: string;
  width: number;
  height: number;
};

function isGif(uri: string, mimeType?: string): boolean {
  if (mimeType?.split(";")[0].trim().toLowerCase() === "image/gif") return true;
  return /\.gif(?:[?#]|$)/i.test(uri);
}

function fileBytes(uri: string): number {
  try {
    return new File(uri).size;
  } catch {
    return 0;
  }
}

/**
 * A WebP copy of a picked avatar, at most 512 pixels wide. Animated GIFs are
 * left alone because flattening them would change what the user picked.
 */
export async function prepareAvatarImage(
  uri: string,
  mimeType?: string,
): Promise<PreparedAvatar | undefined> {
  if (Platform.OS === "web" || isGif(uri, mimeType)) return undefined;
  try {
    const image = await Image.loadAsync(uri, { maxWidth: AVATAR_WIDTH });
    const context = ImageManipulator.manipulate(image);
    if (image.width > AVATAR_WIDTH) context.resize({ width: AVATAR_WIDTH });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      format: SaveFormat.WEBP,
      compress: AVATAR_QUALITY,
    });
    return {
      uri: saved.uri,
      mimeType: "image/webp",
      filename: "avatar.webp",
      width: saved.width,
      height: saved.height,
    };
  } catch {
    return undefined;
  }
}

/**
 * One WebP file per stored width below the source size, generated from the
 * same downscaled bitmap the upload uses. Callers discard them after upload.
 */
export async function preparePhotoUpload(
  uri: string,
  mimeType: string | undefined,
  options: {
    maxWidth?: number;
    quality?: number;
    /** Name to keep (with a `.webp` extension) for the stored file. */
    filename?: string;
  } = {},
): Promise<PreparedPhotoUpload | undefined> {
  if (
    Platform.OS === "web" ||
    isGif(uri, mimeType) ||
    mimeType?.toLowerCase().startsWith("video/")
  )
    return undefined;
  const maxWidth = options.maxWidth ?? PHOTO_MAX_WIDTH;
  const saved: string[] = [];
  try {
    const image = await Image.loadAsync(uri, { maxWidth });
    const width = Math.min(image.width, maxWidth);
    const rendered = await ImageManipulator.manipulate(image)
      .resize({ width })
      .renderAsync();
    const source = await rendered.saveAsync({
      format: SaveFormat.WEBP,
      compress: options.quality ?? PHOTO_QUALITY,
    });
    saved.push(source.uri);
    const variants: PreparedImageVariant[] = [];
    for (const variant of variantWidths(source.width)) {
      const variantImage = await ImageManipulator.manipulate(image)
        .resize({ width: variant })
        .renderAsync();
      const variantSaved = await variantImage.saveAsync({
        format: SaveFormat.WEBP,
        compress: options.quality ?? PHOTO_QUALITY,
      });
      saved.push(variantSaved.uri);
      variants.push({
        name: variantName(variant),
        uri: variantSaved.uri,
        width: variantSaved.width,
        height: variantSaved.height,
        bytes: fileBytes(variantSaved.uri),
        mimeType: "image/webp",
      });
    }
    return {
      uri: source.uri,
      mimeType: "image/webp",
      filename: webpFilename(options.filename),
      width: source.width,
      height: source.height,
      bytes: fileBytes(source.uri),
      variants,
    };
  } catch {
    // A partial batch must not leave cache files behind.
    for (const file of saved) discardPreparedImage(file);
    return undefined;
  }
}

/** Keeps the picked name but tells the receiver the truth about the format. */
function webpFilename(filename: string | undefined): string {
  const base = (filename ?? "photo").replace(/\.[^./\\]+$/, "").trim();
  return `${(base || "photo").slice(0, 140)}.webp`;
}

/** Removes a temporary variant file; files outside app cache are left alone. */
export function discardPreparedImage(uri: string) {
  if (Platform.OS === "web") return;
  try {
    if (!uri.startsWith(Paths.cache.uri)) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The OS may have cleared the cache first; there is nothing to report.
  }
}

/** Removes the re-encoded source and every width generated beside it. */
export function discardPreparedPhoto(photo: PreparedPhotoUpload | undefined) {
  if (!photo) return;
  discardPreparedImage(photo.uri);
  for (const variant of photo.variants) discardPreparedImage(variant.uri);
}
