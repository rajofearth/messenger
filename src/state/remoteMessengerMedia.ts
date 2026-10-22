import type { Message } from "../domain/data";
import { cacheRemoteMedia, saveMediaToGallery } from "../services/mediaCache";

/** Caches a message's media, then copies the cached file to the gallery. */
export async function saveMessageMedia(message: Message) {
  if (!message.uri) return false;
  const uri = await cacheRemoteMedia({
    id: message.id,
    uri: message.uri,
    filename: message.filename,
    mimeType: message.mimeType,
    kind: message.kind,
  });
  if (!uri) return false;
  return saveMediaToGallery(uri).catch(() => false);
}

/** Saves one attachment and records it so a retry never duplicates the album copy. */
export async function saveTrackedMedia(
  message: Message,
  saved: Set<string>,
  onChange: (ids: string[]) => void,
) {
  const result = await saveMessageMedia(message);
  if (result) {
    saved.add(message.id);
    onChange([...saved]);
  }
  return result;
}
