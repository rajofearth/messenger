/**
 * Conversations: the inbox cache and the row every message hangs off.
 *
 * `saveChats` only ever upserts. The server owns the inbox snapshot, but the
 * phone owns history, so a conversation missing from one snapshot is never
 * removed by a write; only clearing, deleting or signing out removes rows.
 * Deleting is a tombstone, not a delete: the row keeps `hidden_at` and
 * `cleared_through`, so a page or receipt that lands afterwards cannot recreate
 * the chat with default columns. Only a snapshot whose newest message is
 * younger than the tombstone brings it back, which is the point of deleting a
 * chat: new messages start it again from empty.
 */

import type { ChatRecord } from "../records";
import { CONVERSATION_COLUMNS } from "./columns";
import { chatFromRow, chatParams } from "./rows";
import type { ConversationRow } from "./rowTypes";
import type { SqlDatabase } from "./types";

const UPSERT = `INSERT INTO conversations (${CONVERSATION_COLUMNS.join(", ")})
VALUES (${CONVERSATION_COLUMNS.map(() => "?").join(", ")})
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  avatar = excluded.avatar,
  preview = excluded.preview,
  time = excluded.time,
  online = excluded.online,
  typing = excluded.typing,
  is_group = excluded.is_group,
  color = excluded.color,
  username = excluded.username,
  bio = excluded.bio,
  created_at = excluded.created_at,
  member_ids = excluded.member_ids,
  admin_ids = excluded.admin_ids,
  muted = excluded.muted,
  blocked = excluded.blocked,
  pinned = excluded.pinned,
  media_visibility = excluded.media_visibility,
  last_message_at = excluded.last_message_at,
  last_message_status = excluded.last_message_status,
  unread = excluded.unread,
  unread_ordinal = CASE
    WHEN excluded.unread > 0 THEN excluded.unread_ordinal
    ELSE conversations.unread_ordinal
  END,
  last_read_unread_ordinal = CASE
    WHEN excluded.unread = 0 THEN conversations.unread_ordinal
    ELSE conversations.last_read_unread_ordinal
  END,
  position = excluded.position,
  -- A deleted chat stays hidden until the inbox snapshot names a message that
  -- is newer than the deletion; that is a genuine incoming message, never a
  -- late page or a queued save.
  hidden_at = CASE
    WHEN conversations.hidden_at IS NULL THEN NULL
    WHEN excluded.last_message_at IS NOT NULL
      AND excluded.last_message_at > conversations.hidden_at
      THEN NULL
    ELSE conversations.hidden_at
  END`;

/** A conversation row for a message write when the inbox has not seen it yet. */
export async function ensureConversation(
  database: SqlDatabase,
  chatId: string,
): Promise<void> {
  // An existing row is left exactly as it is: a tombstoned or cleared
  // conversation must never be recreated with default columns by a late write.
  await database.runAsync(
    "INSERT INTO conversations (id) VALUES (?) ON CONFLICT(id) DO NOTHING",
    chatId,
  );
}

/**
 * A named conversation for a thread that arrived without its inbox entry, such
 * as a legacy thread whose chat the old store never listed. A nameless
 * placeholder (a message write that beat the inbox) is upgraded, because
 * `listChats` leaves those out and the thread would be unreachable.
 */
export async function ensureNamedConversation(
  database: SqlDatabase,
  chatId: string,
  name: string,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO conversations (id, name, position)
     VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM conversations))
     ON CONFLICT(id) DO UPDATE SET name = excluded.name
     WHERE conversations.name = ''`,
    chatId,
    name,
  );
}

export async function listChats(
  database: SqlDatabase,
): Promise<ChatRecord[] | undefined> {
  // A message write creates a placeholder conversation before the inbox has
  // seen it. Those rows have no name and are not threads the reader can open,
  // so the cached inbox leaves them out until `saveChats` fills them in. A
  // deleted chat keeps its row but is hidden the same way.
  const rows = await database.getAllAsync<ConversationRow>(
    `SELECT * FROM conversations
     WHERE name <> '' AND hidden_at IS NULL
     ORDER BY position ASC, id ASC`,
  );
  return rows.length ? rows.map(chatFromRow) : undefined;
}

export async function writeChats(
  database: SqlDatabase,
  chats: readonly ChatRecord[],
): Promise<void> {
  const highest = await database.getFirstAsync<{ ordinal: number }>(
    "SELECT COALESCE(MAX(unread_ordinal), 0) AS ordinal FROM conversations",
  );
  let ordinal = highest?.ordinal ?? 0;
  for (const [position, chat] of chats.entries()) {
    if (chat.unread > 0) ordinal += 1;
    await writeChat(database, chat, position, ordinal);
  }
}

export async function writeChat(
  database: SqlDatabase,
  chat: ChatRecord,
  position: number,
  ordinal: number,
): Promise<void> {
  await database.runAsync(UPSERT, ...chatParams(chat, position, ordinal));
}

/**
 * Deletes a chat the way the app shows it: the history and the queue go, the
 * row stays as a tombstone. Hard-deleting the row would let the next
 * `ensureConversation` recreate it with defaults and no `cleared_through`, and
 * a page that was already in flight would put the deleted messages back.
 */
export async function deleteConversation(
  database: SqlDatabase,
  chatId: string,
): Promise<void> {
  const now = Date.now();
  await ensureConversation(database, chatId);
  await database.runAsync(
    `UPDATE conversations SET
       hidden_at = ?,
       cleared_through = ?,
       unread = 0,
       last_message_status = NULL
     WHERE id = ?`,
    now,
    now,
    chatId,
  );
  // The thread and its queue are what "delete" removes locally; media and
  // variants cascade from the message rows.
  await database.runAsync(
    "DELETE FROM messages WHERE conversation_id = ?",
    chatId,
  );
  await database.runAsync(
    "DELETE FROM outbox WHERE conversation_id = ?",
    chatId,
  );
  // Per-message hides below the clear timestamp are already covered by it.
  await database.runAsync(
    "DELETE FROM hidden_messages WHERE conversation_id = ?",
    chatId,
  );
}
