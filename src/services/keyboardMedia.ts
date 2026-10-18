import { Directory, File, Paths } from "expo-file-system";
import type { KeyboardMedia } from "../ui/KeyboardMediaInput";
import type { Message } from "../domain/data";

/** Copy bytes unchanged so animated GIFs are not flattened by an image editor. */
export function saveKeyboardMedia(media: KeyboardMedia): Partial<Message> {
  const extension = {
    "image/gif": "gif",
    "image/webp": "webp",
    "image/png": "png",
    "image/jpeg": "jpg",
    "video/mp4": "mp4",
  }[media.mimeType];
  if (!extension || !media.uri.startsWith("file://"))
    throw new Error("Unsupported keyboard attachment");
  const source = new File(media.uri);
  if (!source.exists || source.size <= 0 || source.size > 25 * 1024 * 1024)
    throw new Error("Keyboard attachment must be between 1 byte and 25 MB");
  const directory = new Directory(Paths.document, "message-media");
  directory.create({ intermediates: true, idempotent: true });
  const destination = new File(
    directory,
    `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`,
  );
  try {
    source.copy(destination);
  } catch (error) {
    if (destination.exists) destination.delete();
    throw error;
  }
  try {
    source.delete();
  } catch {
    /* Cache cleanup must not discard a successfully saved attachment. */
  }
  return {
    kind: media.mimeType.startsWith("video/") ? "video" : "image",
    uri: destination.uri,
    mimeType: media.mimeType,
    width: media.width,
    height: media.height,
  };
}
