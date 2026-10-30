/**
 * Relay writes: an envelope batch, its inbox head and its acknowledgement rows.
 *
 * A pulled envelope is stored and recorded for acknowledgement in one
 * transaction. The ack itself is sent later by the drain, so a process kill
 * between the commit and the network call retries the ack instead of losing
 * the message. The pending row has no foreign key on purpose: the ack must
 * outlive a message the user deletes before the next drain.
 */

import { messagePreview } from "../../domain/messageActions";
import type { MessageRecord } from "../records";
import { writeThread } from "./messages";
import type { SqlDatabase } from "./types";

export type PendingAck = {
  queueId: string;
  conversationId: string;
};

type BatchFacts = {
  hiddenAt: number | null;
  clearedThrough: number | null;
  /** Ids the user deleted for themselves; the message upsert skips them. */
  hiddenIds: Set<string>;
  /** Ids already stored, so a redelivered envelope does not count as unread. */
  existingIds: Set<string>;
};

function createdAtMs(message: MessageRecord): number {
  const at = message.createdAt ? Date.parse(message.createdAt) : NaN;
  return Number.isFinite(at) ? at : 0;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

async function batchFacts(
  database: SqlDatabase,
  chatId: string,
  ids: readonly string[],
): Promise<BatchFacts> {
  const conversation = await database.getFirstAsync<{
    hidden_at: number | null;
    cleared_through: number | null;
  }>(
    "SELECT hidden_at, cleared_through FROM conversations WHERE id = ?",
    chatId,
  );
  if (!ids.length) {
    return {
      hiddenAt: conversation?.hidden_at ?? null,
      clearedThrough: conversation?.cleared_through ?? null,
      hiddenIds: new Set(),
      existingIds: new Set(),
    };
  }
  const list = placeholders(ids.length);
  const hidden = await database.getAllAsync<{ message_id: string }>(
    `SELECT message_id FROM hidden_messages
     WHERE conversation_id = ? AND message_id IN (${list})`,
    chatId,
    ...ids,
  );
  const existing = await database.getAllAsync<{ id: string }>(
    `SELECT id FROM messages
     WHERE conversation_id = ? AND id IN (${list})`,
    chatId,
    ...ids,
  );
  return {
    hiddenAt: conversation?.hidden_at ?? null,
    clearedThrough: conversation?.cleared_through ?? null,
    hiddenIds: new Set(hidden.map((row) => row.message_id)),
    existingIds: new Set(existing.map((row) => row.id)),
  };
}

/** The newest row of the batch, by server sequence and then by timestamp. */
function newestMessage(messages: readonly MessageRecord[]): MessageRecord {
  return messages.reduce((newest, message) => {
    const newestSequence = newest.sequence ?? -1;
    const sequence = message.sequence ?? -1;
    if (sequence !== newestSequence) {
      return sequence > newestSequence ? message : newest;
    }
    return createdAtMs(message) >= createdAtMs(newest) ? message : newest;
  });
}

/**
 * Writes one pulled batch. Messages are upsert-only, exactly like a normal
 * thread save, so nothing already on the phone is replaced or removed.
 */
export async function writeRelayBatch(
  database: SqlDatabase,
  chatId: string,
  messages: readonly MessageRecord[],
  queueIds: readonly string[],
): Promise<void> {
  const facts = await batchFacts(
    database,
    chatId,
    messages.map((message) => message.id),
  );
  await writeThread(database, chatId, messages);
  const receivedAt = Date.now();
  for (const queueId of queueIds) {
    await database.runAsync(
      `INSERT INTO pending_ack (queue_id, conversation_id, received_at)
       VALUES (?, ?, ?)
       ON CONFLICT(queue_id) DO NOTHING`,
      queueId,
      chatId,
      receivedAt,
    );
  }
  // A deleted chat is a tombstone: the envelope is still acknowledged above,
  // but it must not bring the inbox row or its unread count back.
  if (facts.hiddenAt !== null) return;

  const fresh = messages.filter(
    (message) =>
      !facts.hiddenIds.has(message.id) &&
      (facts.clearedThrough === null ||
        createdAtMs(message) > facts.clearedThrough),
  );
  if (!fresh.length) return;

  const newest = newestMessage(fresh);
  const newestAt = createdAtMs(newest);
  const unread = fresh.filter(
    (message) => !message.mine && !facts.existingIds.has(message.id),
  ).length;
  if (unread > 0) {
    await database.runAsync(
      "UPDATE conversations SET unread = unread + ? WHERE id = ? AND hidden_at IS NULL",
      unread,
      chatId,
    );
  }
  if (!newestAt) return;

  const firstAt = Math.min(
    ...fresh.map(createdAtMs).filter((value) => value > 0),
  );
  // Same projection a normal save leaves behind: the newest confirmed row
  // supplies the preview, the time and `last_message_at`, and no delivery
  // state is stored on a confirmed row. `created_at` is only seeded for a
  // conversation the inbox has not described yet.
  await database.runAsync(
    `UPDATE conversations SET
       preview = ?,
       time = ?,
       last_message_at = ?,
       created_at = COALESCE(created_at, ?)
     WHERE id = ?
       AND hidden_at IS NULL
       AND (last_message_at IS NULL OR last_message_at <= ?)`,
    messagePreview(newest),
    newest.time,
    newestAt,
    Number.isFinite(firstAt) ? new Date(firstAt).toISOString() : null,
    chatId,
    newestAt,
  );
}

export async function listPendingAcks(
  database: SqlDatabase,
): Promise<PendingAck[]> {
  const rows = await database.getAllAsync<{
    queue_id: string;
    conversation_id: string;
  }>(
    `SELECT queue_id, conversation_id FROM pending_ack
     ORDER BY received_at ASC, queue_id ASC`,
  );
  return rows.map((row) => ({
    queueId: row.queue_id,
    conversationId: row.conversation_id,
  }));
}

export async function removePendingAcks(
  database: SqlDatabase,
  queueIds: readonly string[],
): Promise<void> {
  if (!queueIds.length) return;
  await database.runAsync(
    `DELETE FROM pending_ack WHERE queue_id IN (${placeholders(queueIds.length)})`,
    ...queueIds,
  );
}

export async function writeRelayReaction(
  database: SqlDatabase,
  chatId: string,
  messageId: string,
  reaction: string | undefined,
): Promise<void> {
  await database.runAsync(
    "UPDATE messages SET reaction = ? WHERE conversation_id = ? AND id = ?",
    reaction ?? null,
    chatId,
    messageId,
  );
}

/** A redacted row keeps its place but is filtered from reads, like a server one. */
export async function writeRelayDelete(
  database: SqlDatabase,
  chatId: string,
  messageId: string,
): Promise<void> {
  await database.runAsync(
    "UPDATE messages SET deleted = 1 WHERE conversation_id = ? AND id = ?",
    chatId,
    messageId,
  );
}
