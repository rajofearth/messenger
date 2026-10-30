/**
 * Local SQLite schema.
 *
 * One version, no migrations. This is a development app with no users to carry
 * over, so a database written by another build is not upgraded: `applySchema`
 * drops every known table and creates the current shape. A build that changes
 * the schema therefore starts from an empty database on purpose; there is no
 * ranking of old data worth the code that reading it would cost.
 *
 * Tables are ordinary rowid tables (never STRICT), and every optional field is
 * nullable so a writer can leave it out.
 */

import type { SqlDatabase } from "./types";

export const SCHEMA_VERSION = 1;

/** The whole schema, in dependency order. */
const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    avatar TEXT NOT NULL DEFAULT '',
    preview TEXT NOT NULL DEFAULT '',
    time TEXT NOT NULL DEFAULT '',
    is_group INTEGER NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '',
    username TEXT,
    bio TEXT,
    created_at TEXT,
    member_ids TEXT,
    admin_ids TEXT,
    muted INTEGER NOT NULL DEFAULT 0,
    blocked INTEGER NOT NULL DEFAULT 0,
    pinned INTEGER NOT NULL DEFAULT 0,
    media_visibility TEXT,
    last_message_at INTEGER,
    unread INTEGER NOT NULL DEFAULT 0,
    unread_ordinal INTEGER NOT NULL DEFAULT 0,
    last_read_unread_ordinal INTEGER NOT NULL DEFAULT 0,
    cleared_through INTEGER,
    hidden_at INTEGER,
    position INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sequence INTEGER,
    client_message_id TEXT,
    mine INTEGER NOT NULL DEFAULT 0,
    time TEXT NOT NULL DEFAULT '',
    text TEXT,
    kind TEXT,
    mime_type TEXT,
    filename TEXT,
    width REAL,
    height REAL,
    duration REAL,
    reply_to_id TEXT,
    reply_to_preview TEXT,
    reply_to_mine INTEGER,
    reply_to_kind TEXT,
    forwarded INTEGER NOT NULL DEFAULT 0,
    album_id TEXT,
    album_kind TEXT,
    reaction TEXT,
    status TEXT,
    deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT,
    created_at_ms INTEGER,
    local_status TEXT,
    upload_progress REAL,
    storage_id TEXT,
    uri TEXT,
    preview_uri TEXT,
    preview_width REAL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_sequence
    ON messages(conversation_id, sequence) WHERE sequence IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS messages_conversation_created
    ON messages(conversation_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS messages_conversation_client
    ON messages(conversation_id, client_message_id)`,
  `CREATE TABLE IF NOT EXISTS message_variants (
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    uri TEXT NOT NULL,
    width REAL,
    height REAL,
    mime_type TEXT,
    PRIMARY KEY (message_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    avatar TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    width REAL,
    height REAL,
    preview_uri TEXT,
    preview_width REAL,
    mime_type TEXT,
    seen INTEGER NOT NULL DEFAULT 0,
    caption TEXT NOT NULL DEFAULT '',
    video INTEGER NOT NULL DEFAULT 0,
    crop TEXT,
    owner_id TEXT,
    created_at INTEGER,
    expires_at INTEGER,
    upload_status TEXT,
    upload_progress REAL,
    position INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS media_files (
    id TEXT PRIMARY KEY NOT NULL,
    message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
    story_id TEXT REFERENCES stories(id) ON DELETE CASCADE,
    variant TEXT,
    remote_uri TEXT,
    local_path TEXT,
    mime_type TEXT,
    bytes INTEGER,
    width REAL,
    height REAL,
    state TEXT,
    CHECK (message_id IS NOT NULL OR story_id IS NOT NULL)
  )`,
  `CREATE INDEX IF NOT EXISTS media_files_message ON media_files(message_id)`,
  `CREATE INDEX IF NOT EXISTS media_files_story ON media_files(story_id)`,
  `CREATE TABLE IF NOT EXISTS outbox (
    message_id TEXT PRIMARY KEY NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    queued_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS call_history (
    id TEXT PRIMARY KEY NOT NULL,
    chat TEXT NOT NULL,
    video INTEGER NOT NULL DEFAULT 0,
    seconds REAL NOT NULL DEFAULT 0,
    time TEXT NOT NULL DEFAULT '',
    missed INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
    name TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL DEFAULT '',
    haptics INTEGER NOT NULL DEFAULT 1,
    avatar TEXT NOT NULL DEFAULT '',
    sound INTEGER NOT NULL DEFAULT 1,
    previews INTEGER NOT NULL DEFAULT 1,
    system_notifications INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS gallery_saved (
    id TEXT PRIMARY KEY NOT NULL
  )`,
  /*
   * A hidden id outlives its message row on purpose, so it carries no foreign
   * key: no writer may ever put that message back, and the record is what says
   * so. `conversation_id` is kept for the cheap per-thread lookups.
   */
  `CREATE TABLE IF NOT EXISTS hidden_messages (
    message_id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    hidden_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS hidden_messages_conversation
    ON hidden_messages(conversation_id)`,
  /*
   * A pending ack deliberately has no foreign key. The message it names can be
   * deleted locally before the next drain, and the ack must still survive so the
   * server is allowed to drop the envelope. `conversation_id` is kept for the
   * cheap per-thread lookup.
   */
  `CREATE TABLE IF NOT EXISTS pending_ack (
    queue_id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL,
    received_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS pending_ack_conversation
    ON pending_ack(conversation_id)`,
];

/** Tables held today, children before their parents, for sign-out. */
export const SCHEMA_TABLES: readonly string[] = [
  "pending_ack",
  "hidden_messages",
  "media_files",
  "message_variants",
  "messages",
  "outbox",
  "stories",
  "conversations",
  "call_history",
  "settings",
  "gallery_saved",
];

/**
 * Creates the schema unless the file already carries it. Anything else, older
 * or newer, is a database this build cannot read: its tables are dropped and
 * rebuilt empty, because the phone is the durable copy and this app has no
 * history worth interpreting.
 */
export async function applySchema(database: SqlDatabase): Promise<void> {
  const row = await database.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  if ((row?.user_version ?? 0) === SCHEMA_VERSION) return;

  // Foreign keys are a connection setting, so they are switched around the
  // rebuild rather than inside it; a drop would otherwise cascade through the
  // children or refuse while they still reference the parent.
  await database.execAsync("PRAGMA foreign_keys = OFF");
  try {
    await database.withTransactionAsync(async () => {
      for (const table of SCHEMA_TABLES) {
        await database.execAsync(`DROP TABLE IF EXISTS ${table}`);
      }
      for (const statement of SCHEMA_STATEMENTS) {
        await database.execAsync(statement);
      }
      await database.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });
  } finally {
    await database.execAsync("PRAGMA foreign_keys = ON");
  }
}
