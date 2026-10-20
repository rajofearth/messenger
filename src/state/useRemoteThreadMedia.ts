import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Message } from "../domain/data";
import { messengerRepository } from "../data/messengerRepository";
import { cacheRemoteMedia, saveMediaToGallery } from "../services/mediaCache";

type Args = {
  selected: string | null;
  remoteThread: Message[] | undefined;
  mediaVisibility?: "app" | "gallery";
  setMessages: Dispatch<SetStateAction<Record<string, Message[]>>>;
  setGallerySaved: Dispatch<SetStateAction<string[]>>;
  gallerySavedRef: MutableRefObject<Set<string>>;
};

/**
 * Downloads thread media once and keeps the local URI in the cached message.
 * When a conversation opts into gallery visibility, newly received media is
 * copied to the Messenger album exactly once.
 */
export function useRemoteThreadMedia({
  selected,
  remoteThread,
  mediaVisibility,
  setMessages,
  setGallerySaved,
  gallerySavedRef,
}: Args) {
  useEffect(() => {
    if (!selected || !remoteThread) return;
    let active = true;
    // Paint the thread as soon as the query answers; local media replaces the
    // remote URLs as each download completes.
    setMessages((current) => ({ ...current, [selected]: remoteThread }));
    void messengerRepository.saveMessages(selected, remoteThread).catch(() => {});
    void Promise.all(
      remoteThread.map(async (item) => {
        const message = { ...item };
        if (!message.uri || message.kind === "file") return message;
        const uri = await cacheRemoteMedia({
          id: message.id,
          uri: message.uri,
          filename: message.filename,
          mimeType: message.mimeType,
          kind: message.kind,
        });
        return uri && uri !== message.uri ? { ...message, uri } : message;
      }),
    )
      .then(async (next) => {
        if (!active) return;
        setMessages((current) => ({ ...current, [selected]: next }));
        void messengerRepository.saveMessages(selected, next).catch(() => {});
        if (mediaVisibility !== "gallery") return;
        for (const message of next) {
          if (message.mine || !message.uri) continue;
          // The gallery API only accepts photo and video assets; voice notes
          // stay in app storage even when the conversation exports media.
          if (message.kind !== "image" && message.kind !== "video") continue;
          if (gallerySavedRef.current.has(message.id)) continue;
          const saved = await saveMediaToGallery(message.uri).catch(() => false);
          if (!saved) continue;
          gallerySavedRef.current.add(message.id);
          setGallerySaved([...gallerySavedRef.current]);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [
    gallerySavedRef,
    mediaVisibility,
    remoteThread,
    selected,
    setGallerySaved,
    setMessages,
  ]);
}
