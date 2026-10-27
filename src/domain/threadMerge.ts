import type { Chat, Message, MessageStatus } from "./data";

/** How far after a local send the server copy may appear. */
export const SERVER_MATCH_WINDOW_MS = 30 * 60 * 1000;

/** True once the server has echoed the message with a sequence number. */
export function isConfirmed(message: Message): boolean {
  return message.sequence !== undefined;
}

export function isPendingStatus(status: MessageStatus | undefined): boolean {
  return status === "sending" || status === "failed";
}

/**
 * The newest server sequence in a thread. Local-only sends have no sequence,
 * so looking at the last array element can miss the actual unread rows.
 */
export function newestReadSequence(messages: Message[]): number | undefined {
  let newest: number | undefined;
  for (const message of messages) {
    if (
      message.sequence !== undefined &&
      (newest === undefined || message.sequence > newest)
    ) {
      newest = message.sequence;
    }
  }
  return newest;
}

/**
 * Server message ids are Convex document ids, not the client id used for the
 * optimistic bubble, so match a sent message by its sender, payload and the
 * time immediately after the local send. The one-to-one `used` set in
 * mergeThread prevents two identical sends from collapsing into one.
 */
export function sameOptimistic(remote: Message, local: Message): boolean {
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
 * A cached preview for the chosen width survives too; an empty local preview
 * never replaces the server's copy. Failed bubbles stay because the server
 * page has no copy to replace them.
 */
export function mergeThread(remote: Message[], local: Message[]): Message[] {
  const localById = new Map(local.map((message) => [message.id, message]));
  const merged = remote.map((message) => {
    const cached = localById.get(message.id);
    if (!cached) return message;
    let next = message;
    const uri = cached.uri?.startsWith("file://") ? cached.uri : message.uri;
    if (uri && uri !== message.uri) next = { ...next, uri };
    const previewUri = cached.previewUri || message.previewUri;
    const previewWidth = cached.previewUri
      ? (cached.previewWidth ?? message.previewWidth)
      : message.previewWidth;
    if (
      previewUri &&
      (previewUri !== message.previewUri ||
        previewWidth !== message.previewWidth)
    ) {
      next = { ...next, previewUri, previewWidth };
    }
    return next;
  });
  const used = new Set<string>();
  const optimistic = local.filter((message) => {
    if (isConfirmed(message)) return false;
    // A failed bubble always stays until the user retries it. Matching it to
    // an older identical message would make the failure disappear silently.
    if (message.status === "failed") return true;
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
 * Keep an unconfirmed inbox row while the server snapshot catches up, but let
 * a newer server message (or a later server timestamp) replace it.
 */
export function mergeChats(remote: Chat[], local: Chat[]): Chat[] {
  return remote.map((chat) => {
    const current = local.find((item) => item.id === chat.id);
    if (!current || !isPendingStatus(current.lastMessageStatus)) return chat;
    const serverAt = chat.lastMessageAt ?? 0;
    const localAt = current.lastMessageAt ?? 0;
    if (localAt < serverAt) return chat;
    return {
      ...chat,
      preview: current.preview,
      time: current.time,
      lastMessageAt: current.lastMessageAt,
      lastMessageStatus: current.lastMessageStatus,
    };
  });
}
