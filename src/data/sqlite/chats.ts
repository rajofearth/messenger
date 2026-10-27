/**
 * Conversations: the inbox cache and the row every message hangs off.
 *
 * `saveChats` only ever upserts. The server owns the inbox snapshot, but the
 * phone owns history, so a conversation missing from one snapshot is never
 * removed by a write; only clearing, deleting or signing out removes rows.
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
  position = excluded.position`;

/** A conversation row for a message write when the inbox has not seen it yet. */
export async function ensureConversation(
  database: SqlDatabase,
  chatId: string,
): Promise<void> {
  await database.runAsync(
    "INSERT INTO conversations (id) VALUES (?) ON CONFLICT(id) DO NOTHING",
    chatId,
  );
}

export async function listChats(
  database: SqlDatabase,
): Promise<ChatRecord[] | undefined> {
  // A message write creates a placeholder conversation before the inbox has
  // seen it. Those rows have no name and are not threads the reader can open,
  // so the cached inbox leaves them out until `saveChats` fills them in.
  const rows = await database.getAllAsync<ConversationRow>(
    "SELECT * FROM conversations WHERE name <> '' ORDER BY position ASC, id ASC",
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

export async function deleteConversation(
  database: SqlDatabase,
  chatId: string,
): Promise<void> {
  await database.runAsync("DELETE FROM conversations WHERE id = ?", chatId);
}
