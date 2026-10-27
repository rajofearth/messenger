/**
 * The durable outgoing queue, rebuilt from pending message rows.
 *
 * The message row and its outbox entry are written together, so a send that
 * was queued once comes back as a failed bubble with its text, local file and
 * finalized storage id intact. Removing a record removes its pending row; a
 * confirmed row is never touched here.
 */

import type { MessageRecord, OutboxRecord } from "../records";
import { messageFromRow } from "./rows";
import type { MessageRow } from "./rowTypes";
import { writePendingMessage } from "./messages";
import type { SqlDatabase } from "./types";

type OutboxRow = MessageRow & { outbox_conversation_id: string };

function queuedAt(message: OutboxRecord["message"]): number {
  const at = message.createdAt ? Date.parse(message.createdAt) : NaN;
  return Number.isFinite(at) ? at : Date.now();
}

export async function listOutbox(
  database: SqlDatabase,
): Promise<OutboxRecord[]> {
  const rows = await database.getAllAsync<OutboxRow>(
    `SELECT m.*, o.conversation_id AS outbox_conversation_id
     FROM outbox AS o
     JOIN messages AS m ON m.id = o.message_id
     WHERE m.sequence IS NULL AND m.local_status IS NOT NULL
     ORDER BY o.queued_at ASC, o.message_id ASC`,
  );
  return rows.map((row) => ({
    chatId: row.outbox_conversation_id,
    message: messageFromRow(row),
  }));
}

/**
 * Writes the whole queue in one transaction. A record that left the list loses
 * its pending row, which also cascades its outbox entry; the server-confirmed
 * copy of that message, if it exists, is left alone.
 */
export async function writeOutbox(
  database: SqlDatabase,
  records: readonly OutboxRecord[],
): Promise<void> {
  const existing = await database.getAllAsync<{ message_id: string }>(
    "SELECT message_id FROM outbox",
  );
  // A confirmed row is never queued again, even if a stale snapshot names it.
  const pending = records.filter(
    (record) => record.message.sequence === undefined,
  );
  const listed = new Set<string>();
  for (const record of pending) {
    const { message } = record;
    const queued: MessageRecord = {
      ...message,
      sequence: undefined,
      status: message.status === "failed" ? "failed" : "sending",
    };
    const written = await writePendingMessage(database, record.chatId, queued);
    // A confirmed server row wins over a stale snapshot naming the same id.
    if (!written) continue;
    listed.add(message.id);
    await database.runAsync(
      `INSERT INTO outbox (message_id, conversation_id, queued_at)
       VALUES (?, ?, ?)
       ON CONFLICT(message_id) DO UPDATE SET conversation_id = excluded.conversation_id`,
      message.id,
      record.chatId,
      queuedAt(message),
    );
  }
  for (const row of existing) {
    if (listed.has(row.message_id)) continue;
    await database.runAsync(
      "DELETE FROM messages WHERE id = ? AND sequence IS NULL",
      row.message_id,
    );
    await database.runAsync(
      "DELETE FROM outbox WHERE message_id = ?",
      row.message_id,
    );
  }
}
