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
const VARIANT_QUALITY = 0.78;
const MAX_SOURCE_WIDTH = 2048;

export type PreparedImageVariant = {
  name: string;
  uri: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: string;
};

export type PreparedImage = {
  variants: PreparedImageVariant[];
  width: number;
  height: number;
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
 * One WebP file per stored width below the source size. The source file is
 * left where it is; callers upload the variants and can then discard them.
 */
export async function prepareImageVariants(
  uri: string,
  mimeType?: string,
): Promise<PreparedImage> {
  const empty: PreparedImage = { variants: [], width: 0, height: 0 };
  if (
    Platform.OS === "web" ||
    isGif(uri, mimeType) ||
    mimeType?.toLowerCase().startsWith("video/")
  )
    return empty;
  try {
    const image = await Image.loadAsync(uri, { maxWidth: MAX_SOURCE_WIDTH });
    const prepared: PreparedImage = {
      variants: [],
      width: image.width,
      height: image.height,
    };
    for (const width of variantWidths(image.width)) {
      const rendered = await ImageManipulator.manipulate(image)
        .resize({ width })
        .renderAsync();
      const saved = await rendered.saveAsync({
        format: SaveFormat.WEBP,
        compress: VARIANT_QUALITY,
      });
      prepared.variants.push({
        name: variantName(width),
        uri: saved.uri,
        width: saved.width,
        height: saved.height,
        bytes: fileBytes(saved.uri),
        mimeType: "image/webp",
      });
    }
    return prepared;
  } catch {
    return empty;
  }
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
