/**
 * Message rows, newest-first reads, upsert-only writes and thread flags.
 *
 * A thread is two queries: the newest confirmed page (server rows own their
 * sequence) and the pending sends that only live on this device. Reads never
 * return a deleted row or one the user cleared past.
 */

import type { MessageRecord } from "../records";
import { ensureConversation } from "./chats";
import { MESSAGE_COLUMNS } from "./columns";
import {
  messageFromRow,
  messageParams,
  messageVariantParams,
  variantFromRow,
} from "./rows";
import type { MessageRow, MessageVariantRow } from "./rowTypes";
import { messageMedia, replaceMessageMedia } from "./media";
import type { SqlDatabase, SqlValue } from "./types";

export const THREAD_PAGE_SIZE = 100;

const UPSERT = `INSERT INTO messages (${MESSAGE_COLUMNS.join(", ")})
VALUES (${MESSAGE_COLUMNS.map(() => "?").join(", ")})
ON CONFLICT(id) DO UPDATE SET ${MESSAGE_COLUMNS.filter((column) => column !== "id")
  .map((column) => `${column} = excluded.${column}`)
  .join(", ")}`;

const CONFIRMED_FILTER = `conversation_id = ?
  AND sequence IS NOT NULL
  AND deleted = 0
  AND (created_at_ms IS NULL OR ? IS NULL OR created_at_ms > ?)`;

const PENDING_FILTER = `conversation_id = ?
  AND sequence IS NULL
  AND local_status IS NOT NULL
  AND deleted = 0
  AND (created_at_ms IS NULL OR ? IS NULL OR created_at_ms > ?)`;

async function upsertMessage(
  database: SqlDatabase,
  chatId: string,
  message: MessageRecord,
  pendingOnly = false,
): Promise<number> {
  await ensureConversation(database, chatId);
  const result = await database.runAsync(
    pendingOnly ? `${UPSERT} WHERE messages.sequence IS NULL` : UPSERT,
    ...messageParams(chatId, message),
  );
  if (result.changes === 0) return 0;

  await database.runAsync(
    "DELETE FROM message_variants WHERE message_id = ?",
    message.id,
  );
  const variants = (message.variants ?? []).filter(
    (variant) => typeof variant.name === "string" && typeof variant.uri === "string",
  );
  if (variants.length) {
    const values = variants.flatMap((variant) =>
      messageVariantParams(message.id, variant),
    );
    const row = "(?, ?, ?, ?, ?, ?)";
    await database.runAsync(
      `INSERT INTO message_variants (message_id, name, uri, width, height, mime_type)
       VALUES ${variants.map(() => row).join(", ")}`,
      ...values,
    );
  }
  await replaceMessageMedia(database, message.id, messageMedia(message));
  return result.changes;
}

/** Writes a whole thread in one transaction; older rows are left untouched. */
export async function writeThread(
  database: SqlDatabase,
  chatId: string,
  messages: readonly MessageRecord[],
): Promise<void> {
  for (const message of messages) {
    await upsertMessage(database, chatId, message);
  }
}

/** Writes a pending send, never overwriting a row the server has confirmed. */
export async function writePendingMessage(
  database: SqlDatabase,
  chatId: string,
  message: MessageRecord,
): Promise<number> {
  return upsertMessage(database, chatId, message, true);
}

async function readVariants(
  database: SqlDatabase,
  ids: readonly string[],
): Promise<Map<string, MessageVariantRow[]>> {
  const grouped = new Map<string, MessageVariantRow[]>();
  if (!ids.length) return grouped;
  const rows = await database.getAllAsync<MessageVariantRow>(
    `SELECT * FROM message_variants
     WHERE message_id IN (${ids.map(() => "?").join(", ")})
     ORDER BY message_id ASC, width ASC, name ASC`,
    ...ids,
  );
  for (const row of rows) {
    const current = grouped.get(row.message_id);
    if (current) current.push(row);
    else grouped.set(row.message_id, [row]);
  }
  return grouped;
}

function toMessages(
  rows: readonly MessageRow[],
  variants: Map<string, MessageVariantRow[]>,
): MessageRecord[] {
  return rows.map((row) =>
    messageFromRow(
      row,
      (variants.get(row.id) ?? []).flatMap((variant) => {
        const mapped = variantFromRow(variant);
        return mapped ? [mapped] : [];
      }),
    ),
  );
}

async function clearedThrough(
  database: SqlDatabase,
  chatId: string,
): Promise<number | null> {
  const row = await database.getFirstAsync<{ cleared_through: number | null }>(
    "SELECT cleared_through FROM conversations WHERE id = ?",
    chatId,
  );
  return row?.cleared_through ?? null;
}

/**
 * The newest confirmed page, ascending, followed by the pending sends. The
 * cleared timestamp is applied here as well as on the server, so a page that
 * was in flight while the user cleared a chat cannot bring the old rows back.
 */
export async function readThread(
  database: SqlDatabase,
  chatId: string,
  limit = THREAD_PAGE_SIZE,
): Promise<MessageRecord[]> {
  const cleared = await clearedThrough(database, chatId);
  const confirmed = await database.getAllAsync<MessageRow>(
    `SELECT * FROM messages WHERE ${CONFIRMED_FILTER}
     ORDER BY sequence DESC LIMIT ?`,
    chatId,
    cleared,
    cleared,
    limit,
  );
  const pending = await database.getAllAsync<MessageRow>(
    `SELECT * FROM messages WHERE ${PENDING_FILTER}
     ORDER BY COALESCE(created_at_ms, 0) ASC, id ASC`,
    chatId,
    cleared,
    cleared,
  );
  const rows = [...confirmed.reverse(), ...pending];
  const variants = await readVariants(
    database,
    rows.map((row) => row.id),
  );
  return toMessages(rows, variants);
}

/** The page just before `beforeSequence`, ascending. */
export async function readOlderThread(
  database: SqlDatabase,
  chatId: string,
  beforeSequence: number,
  limit = THREAD_PAGE_SIZE,
): Promise<MessageRecord[]> {
  const cleared = await clearedThrough(database, chatId);
  const rows = await database.getAllAsync<MessageRow>(
    `SELECT * FROM messages WHERE ${CONFIRMED_FILTER} AND sequence < ?
     ORDER BY sequence DESC LIMIT ?`,
    chatId,
    cleared,
    cleared,
    beforeSequence,
    limit,
  );
  const ascending = rows.reverse();
  const variants = await readVariants(
    database,
    ascending.map((row) => row.id),
  );
  return toMessages(ascending, variants);
}

/** Empties a thread locally and remembers how far the user cleared it. */
export async function resetThread(
  database: SqlDatabase,
  chatId: string,
): Promise<void> {
  await database.runAsync(
    "DELETE FROM messages WHERE conversation_id = ?",
    chatId,
  );
  await database.runAsync(
    `UPDATE conversations SET
       cleared_through = ?,
       preview = 'No messages yet',
       time = '',
       unread = 0,
       last_message_at = NULL,
       last_message_status = NULL
     WHERE id = ?`,
    Date.now(),
    chatId,
  );
}

export async function removeMessage(
  database: SqlDatabase,
  chatId: string,
  messageId: string,
): Promise<void> {
  await database.runAsync(
    "DELETE FROM messages WHERE conversation_id = ? AND id = ?",
    chatId,
    messageId,
  );
}

/**
 * Whether the server is likely to have rows older than the local page: false
 * once the thread is known to start at sequence 1 or was marked exhausted.
 */
export async function hasOlderThread(
  database: SqlDatabase,
  chatId: string,
): Promise<boolean> {
  const row = await database.getFirstAsync<{
    exhausted: number | null;
    oldest: number | null;
  }>(
    `SELECT
       history_exhausted_at AS exhausted,
       (SELECT MIN(sequence) FROM messages
         WHERE conversation_id = conversations.id AND sequence IS NOT NULL) AS oldest
     FROM conversations WHERE id = ?`,
    chatId,
  );
  if (!row || row.exhausted != null) return false;
  return row.oldest === null || row.oldest > 1;
}

export async function exhaustThread(
  database: SqlDatabase,
  chatId: string,
): Promise<void> {
  await database.runAsync(
    "UPDATE conversations SET history_exhausted_at = ? WHERE id = ?",
    Date.now(),
    chatId,
  );
}
