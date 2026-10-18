import type { Message } from "./data";

// These optional fields also allow callers to adopt album metadata incrementally.
type AlbumMessage = Message & { albumId?: string; mimeType?: string };
export type MediaRow =
  | { type: "message"; message: Message }
  | { type: "album"; id: string; messages: Message[] };

function eligible(message: AlbumMessage): boolean {
  const mimeType = message.mimeType?.split(";")[0].trim().toLowerCase();
  const gif = mimeType === "image/gif" ||
    (!mimeType && /\.gif$/i.test(message.uri?.split(/[?#]/, 1)[0] ?? ""));
  return (
    (message.kind === "image" || message.kind === "video") &&
    !message.deleted &&
    !message.forwarded &&
    !gif
  );
}

function canGroup(previous: AlbumMessage, next: AlbumMessage): boolean {
  if (
    !eligible(previous) || !eligible(next) ||
    previous.mine !== next.mine || previous.replyTo?.id !== next.replyTo?.id
  ) return false;
  if (previous.albumId || next.albumId)
    return !!previous.albumId && previous.albumId === next.albumId;
  // Never infer dates from the display-only time label.
  if (!previous.createdAt || !next.createdAt) return false;
  const before = Date.parse(previous.createdAt);
  const after = Date.parse(next.createdAt);
  return Number.isFinite(before) && Number.isFinite(after) &&
    after >= before && after - before <= 120_000;
}

export function groupMediaMessages(messages: readonly Message[]): MediaRow[] {
  const rows: MediaRow[] = [];
  for (const message of messages) {
    const last = rows[rows.length - 1];
    const previous = last?.type === "album"
      ? last.messages[last.messages.length - 1]
      : last?.message;
    if (previous && canGroup(previous, message) &&
        (last.type !== "album" || last.messages.length < 50)) {
      if (last.type === "album") last.messages.push(message);
      else rows[rows.length - 1] = {
        type: "album", id: previous.id, messages: [previous, message],
      };
    } else rows.push({ type: "message", message });
  }
  return rows;
}

/** The fourth preview is covered, so it counts toward the overflow label. */
export function albumOverflowCount(total: number): number {
  return total > 4 ? total - 3 : 0;
}
