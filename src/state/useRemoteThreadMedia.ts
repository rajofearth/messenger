import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Message } from "../domain/data";
import { messengerRepository } from "../data/messengerRepository";
import { cacheRemoteMedia, saveMediaToGallery } from "../services/mediaCache";

type Args = {
  selected: string | null;
  remoteThread: Message[] | undefined;
  mediaVisibility?: "app" | "gallery";
  messagesRef: MutableRefObject<Record<string, Message[]>>;
  setMessages: Dispatch<SetStateAction<Record<string, Message[]>>>;
  setGallerySaved: Dispatch<SetStateAction<string[]>>;
  gallerySavedRef: MutableRefObject<Set<string>>;
};

const SERVER_MATCH_WINDOW_MS = 30 * 60 * 1000;

/**
 * Server message ids are Convex document ids, not the client id used for the
 * optimistic bubble, so match a sent message by its sender, payload and the
 * time immediately after the local send. The one-to-one `used` set prevents
 * two identical sends from collapsing into one.
 */
function sameOptimistic(remote: Message, local: Message) {
  if (remote.mine !== local.mine) return false;
  if (remote.deleted) return false;
  if (remote.kind !== local.kind) return false;
  if ((remote.text || "") !== (local.text || "")) return false;
  // Image and keyboard picks have no filename until uploadLocalFile derives one
  // from the temporary file, so only reject when both sides name the file.
  if (remote.filename && local.filename && remote.filename !== local.filename) {
    return false;
  }
  const remoteAt = remote.createdAt ? Date.parse(remote.createdAt) : NaN;
  const localAt = local.createdAt ? Date.parse(local.createdAt) : NaN;
  if (!Number.isFinite(remoteAt) || !Number.isFinite(localAt)) return false;
  // Allow a minute of device-clock skew; the server still has to be the later
  // copy, so an old identical message cannot hide a new optimistic send.
  return remoteAt >= localAt - 60_000 && remoteAt <= localAt + SERVER_MATCH_WINDOW_MS;
}

/**
 * Keep local-only bubbles while the server page catches up, and reuse media
 * already downloaded to this device instead of dropping it on every refresh.
 */
function mergeThread(remote: Message[], local: Message[]) {
  const localById = new Map(local.map((message) => [message.id, message]));
  const merged = remote.map((message) => {
    const cached = localById.get(message.id);
    const uri = cached?.uri?.startsWith("file://") ? cached.uri : message.uri;
    return uri && uri !== message.uri ? { ...message, uri } : message;
  });
  const used = new Set<string>();
  const optimistic = local.filter((message) => {
    if (message.sequence !== undefined) return false;
    const match = remote.find(
      (item) => !used.has(item.id) && sameOptimistic(item, message),
    );
    if (match) {
      used.add(match.id);
      return false;
    }
    return true;
  });
  return [...merged, ...optimistic];
}

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
    // Only server-confirmed rows belong on disk; a killed process must not
    // revive an optimistic bubble that never reached the server.
    void messengerRepository
      .saveMessages(
        selected,
        initial.filter((message) => message.sequence !== undefined),
      )
      .catch(() => {});
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
        const merged = mergeThread(
          next,
          messagesRef.current[selected] || [],
        );
        setMessages((current) => ({ ...current, [selected]: merged }));
        void messengerRepository
          .saveMessages(
            selected,
            merged.filter((message) => message.sequence !== undefined),
          )
          .catch(() => {});
        if (mediaVisibility !== "gallery") return;
        for (const message of merged) {
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
    messagesRef,
    remoteThread,
    selected,
    setGallerySaved,
    setMessages,
  ]);
}
