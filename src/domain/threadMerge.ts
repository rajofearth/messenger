import type { Message } from "./data";

/**
 * The two thread helpers the local-history model still needs.
 *
 * The relay never serves a thread, so there is no server page to reconcile: an
 * older page comes from this phone's own database, and a confirmed row is the
 * one the relay gave a sequence. Everything the old explorer needed — matching
 * an optimistic bubble to a server copy, keeping an inbox row until a server
 * snapshot caught up, tracking read sequences — went with the server history.
 */

/** True once the relay has confirmed the message with a sequence number. */
export function isConfirmed(
  message: Message,
): message is Message & { sequence: number } {
  return message.sequence !== undefined;
}

/**
 * Keeps the media this device already downloaded when a stored row is replaced
 * by another copy of itself: a `file://` original and a cached preview survive.
 */
function withLocalMedia(remote: Message, cached: Message): Message {
  let next = remote;
  const uri = cached.uri?.startsWith("file://") ? cached.uri : remote.uri;
  if (uri && uri !== remote.uri) next = { ...next, uri };
  const previewUri = cached.previewUri || remote.previewUri;
  const previewWidth = cached.previewUri
    ? (cached.previewWidth ?? remote.previewWidth)
    : remote.previewWidth;
  if (
    previewUri &&
    (previewUri !== remote.previewUri || previewWidth !== remote.previewWidth)
  ) {
    next = { ...next, previewUri, previewWidth };
  }
  return next;
}

/**
 * Adds a page of older history to the thread without dropping local rows.
 *
 * An older page is additive: a row the page does not name is not a deletion.
 * Both pages came from this device, so the page wins over the row already in
 * memory, except for media this device has already downloaded. Pending sends
 * have no sequence and stay at the end.
 */
export function mergeOlderPage(page: Message[], local: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const message of local) byId.set(message.id, message);
  for (const message of page) {
    const cached = byId.get(message.id);
    byId.set(message.id, cached ? withLocalMedia(message, cached) : message);
  }
  const all = [...byId.values()];
  const confirmed = all
    .filter(isConfirmed)
    .sort((a, b) => a.sequence - b.sequence);
  const pending = all.filter((message) => !isConfirmed(message));
  return [...confirmed, ...pending];
}
