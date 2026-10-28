import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { PixelRatio } from "react-native";
import type { Message } from "../domain/data";
import { chooseImageSource } from "../domain/imageVariants";
import { isConfirmed, mergeThread } from "../domain/threadMerge";
import { messengerRepository } from "../data/messengerRepository";
import { cacheRemoteMedia } from "../services/mediaCache";
import { saveMessageMedia } from "./remoteMessengerMedia";

type Args = {
  selected: string | null;
  remoteThread: Message[] | undefined;
  mediaVisibility?: "app" | "gallery";
  messagesRef: MutableRefObject<Record<string, Message[]>>;
  setMessages: Dispatch<SetStateAction<Record<string, Message[]>>>;
  setGallerySaved: Dispatch<SetStateAction<string[]>>;
  gallerySavedRef: MutableRefObject<Set<string>>;
  /** Called after the head page is durable, so "older" can be re-read. */
  onHeadPageSaved?: (chatId: string) => void;
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
  messagesRef,
  setMessages,
  setGallerySaved,
  gallerySavedRef,
  onHeadPageSaved,
}: Args) {
  useEffect(() => {
    if (!selected || !remoteThread) return;
    let active = true;
    // Paint the thread as soon as the query answers, reusing any local media
    // and keeping optimistic messages that the server page does not know yet.
    const initial = mergeThread(
      remoteThread,
      messagesRef.current[selected] || [],
    );
    setMessages((current) => ({ ...current, [selected]: initial }));
    // Only the page that just arrived belongs on disk; older confirmed rows
    // are already there, and re-upserting the whole thread on every refresh
    // grows the write cost with history.
    const pageIds = new Set(remoteThread.map((message) => message.id));
    const page = initial.filter(
      (message) => isConfirmed(message) && pageIds.has(message.id),
    );
    // Re-derive "older" only once the head page is durable: before this write
    // the database cannot tell a short thread from a page that never arrived.
    void messengerRepository
      .saveMessages(selected, page)
      .then(() => onHeadPageSaved?.(selected))
      .catch(() => {});
    void Promise.all(
      remoteThread.map(async (item) => {
        if (!item.uri || item.kind === "file") return item;
        // An image keeps its remote original in `uri` and caches the chosen
        // bubble width beside it, so opening or saving still has full quality.
        if (item.kind === "image" && item.variants?.length) {
          const choice = chooseImageSource({
            uri: item.uri,
            variants: item.variants,
            sourceWidth: item.width,
            displayWidth: 220,
            density: PixelRatio.get(),
          });
          if (
            choice?.kind === "variant" &&
            choice.name &&
            choice.width !== undefined
          ) {
            const previewUri = await cacheRemoteMedia({
              id: item.id,
              uri: choice.uri,
              variant: choice.name,
              mimeType: choice.mimeType,
              kind: item.kind,
            });
            // A failed download keeps the remote variant for the renderer.
            if (previewUri && previewUri !== choice.uri) {
              return { ...item, previewUri, previewWidth: choice.width };
            }
            return item;
          }
        }
        const uri = await cacheRemoteMedia({
          id: item.id,
          uri: item.uri,
          filename: item.filename,
          mimeType: item.mimeType,
          kind: item.kind,
        });
        return uri && uri !== item.uri ? { ...item, uri } : item;
      }),
    )
      .then(async (next) => {
        if (!active) return;
        const merged = mergeThread(
          next,
          messagesRef.current[selected] || [],
        );
        setMessages((current) => ({ ...current, [selected]: merged }));
        // Same page-only save: a killed process must not revive an optimistic
        // bubble, and rows above the page are already durable.
        void messengerRepository
          .saveMessages(
            selected,
            merged.filter(
              (message) => isConfirmed(message) && pageIds.has(message.id),
            ),
          )
          .catch(() => {});
        if (mediaVisibility !== "gallery") return;
        for (const message of merged) {
          if (message.mine || !message.uri) continue;
          // The gallery API only accepts photo and video assets; voice notes
          // stay in app storage even when the conversation exports media.
          if (message.kind !== "image" && message.kind !== "video") continue;
          if (gallerySavedRef.current.has(message.id)) continue;
          const saved = await saveMessageMedia(message).catch(() => false);
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
    messagesRef,
    onHeadPageSaved,
    remoteThread,
    selected,
    setGallerySaved,
    setMessages,
  ]);
}
