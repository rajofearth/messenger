import type { Chat, Message } from "./data";
import { messagePreview } from "./messageActions";

/**
 * One outgoing message that the server has not confirmed yet. The structural
 * shape matches `OutboxRecord` in `src/data/records.ts`; keeping it here lets
 * the merge rules stay pure and testable.
 */
export type OutboxRecord = {
  chatId: string;
  message: Message;
};

/**
 * A send is only confirmed when the mutation returns a server sequence. Until
 * then the bubble stays pending and the outbox row stays on disk, so a kill in
 * the echo window can never turn an unconfirmed send into a cached message.
 */
export function isSendConfirmed(
  receipt: { id?: string; sequence?: number } | null | undefined,
): boolean {
  if (!receipt || !receipt.id) return false;
  return typeof receipt.sequence === "number" && receipt.sequence > 0;
}

function sentAt(message: Message): number | undefined {
  const at = message.createdAt ? Date.parse(message.createdAt) : NaN;
  return Number.isFinite(at) ? at : undefined;
}

/**
 * Adds the persisted outbox rows to the threads on screen. They are shown as
 * failed so a cold start always offers a retry, never a fake sent bubble.
 * Records are appended in send order and deduplicated by message id.
 */
export function hydrateOutbox(
  messagesByChat: Record<string, Message[]>,
  records: readonly OutboxRecord[],
): Record<string, Message[]> {
  if (!records.length) return messagesByChat;
  const next: Record<string, Message[]> = { ...messagesByChat };
  for (const record of records) {
    const thread = next[record.chatId]
      ? [...next[record.chatId]]
      : [];
    if (thread.some((message) => message.id === record.message.id)) continue;
    thread.push({ ...record.message, status: "failed", uploadProgress: undefined });
    next[record.chatId] = thread;
  }
  return next;
}

/** The newest outbox message per chat, in send order for equal timestamps. */
function newestByChat(records: readonly OutboxRecord[]) {
  const newest = new Map<string, Message>();
  for (const record of records) {
    const current = newest.get(record.chatId);
    if (!current) {
      newest.set(record.chatId, record.message);
      continue;
    }
    const at = sentAt(record.message);
    const currentAt = sentAt(current);
    if (at === undefined) continue;
    if (currentAt === undefined || at >= currentAt) {
      newest.set(record.chatId, record.message);
    }
  }
  return newest;
}

/**
 * Makes the inbox agree with the outbox after a cold start: preview, time and
 * pending state come from the chat's newest unsent row. An older outbox row
 * never hides a newer server message the device already knows about.
 */
export function applyOutboxToChats(
  chats: Chat[],
  records: readonly OutboxRecord[],
): Chat[] {
  if (!records.length) return chats;
  const newest = newestByChat(records);
  return chats.map((chat) => {
    const message = newest.get(chat.id);
    if (!message) return chat;
    const at = sentAt(message);
    if (
      at !== undefined &&
      chat.lastMessageAt !== undefined &&
      at < chat.lastMessageAt
    ) {
      return chat;
    }
    return {
      ...chat,
      preview: messagePreview(message),
      time: message.time,
      lastMessageAt: at ?? chat.lastMessageAt,
      lastMessageStatus: "failed",
    };
  });
}

/** Rows the resume loop may attempt again without user input. */
export function retryableOutbox(
  records: readonly OutboxRecord[],
): OutboxRecord[] {
  return records.filter(
    (record) =>
      record.message.status === "failed" ||
      record.message.status === "sending",
  );
}
