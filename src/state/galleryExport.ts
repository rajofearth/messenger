import type { Chat } from "../domain/data";
import { messengerRepository } from "../data/messengerRepository";
import { saveMessageMedia } from "./remoteMessengerMedia";

/**
 * Copies newly received media into the device gallery for conversations that
 * asked for it. The relay drain is the only place a new message arrives, so it
 * is also the only place this has to run; the stored row is re-read because the
 * drain commits before the cache is refreshed.
 */
export async function exportGalleryMedia(
  chatIds: readonly string[],
  chats: readonly Chat[],
  saved: Set<string>,
  onChange: (ids: string[]) => void,
): Promise<void> {
  for (const chatId of chatIds) {
    const chat = chats.find((item) => item.id === chatId);
    if (chat?.mediaVisibility !== "gallery") continue;
    const stored = (await messengerRepository.loadMessages(chatId)) ?? [];
    for (const message of stored) {
      if (message.mine || !message.uri) continue;
      // The gallery API only accepts photo and video assets; voice notes and
      // files stay in app storage even when the conversation exports media.
      if (message.kind !== "image" && message.kind !== "video") continue;
      if (saved.has(message.id)) continue;
      const written = await saveMessageMedia(message).catch(() => false);
      if (!written) continue;
      saved.add(message.id);
      onChange([...saved]);
    }
  }
}
