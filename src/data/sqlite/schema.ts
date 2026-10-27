/**
 * Local SQLite schema.
 *
 * The schema is additive only: it is applied once and versioned through
 * `PRAGMA user_version`, so a later release appends a statement list for its
 * new version instead of rewriting a table. Tables are ordinary rowid tables
 * (never STRICT), and every optional field is nullable so an older writer can
 * keep saving rows after an upgrade.
 */

import type { SqlDatabase } from "./types";

export const SCHEMA_VERSION = 1;

/** Statements for version 1, in dependency order. */
const VERSION_1: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    avatar TEXT NOT NULL DEFAULT '',
    preview TEXT NOT NULL DEFAULT '',
    time TEXT NOT NULL DEFAULT '',
    online INTEGER NOT NULL DEFAULT 0,
    typing INTEGER NOT NULL DEFAULT 0,
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
    last_message_status TEXT,
    unread INTEGER NOT NULL DEFAULT 0,
    unread_ordinal INTEGER NOT NULL DEFAULT 0,
    last_read_unread_ordinal INTEGER NOT NULL DEFAULT 0,
    cleared_through INTEGER,
    hidden_at INTEGER,
    history_exhausted_at INTEGER,
    position INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sequence INTEGER,
    revision INTEGER,
    client_message_id TEXT,
    author_subject_id TEXT,
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
    edited_at TEXT,
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
  `CREATE TABLE IF NOT EXISTS migration_state (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )`,
];

/** Tables wiped on sign-out, children before their parents. */
export const SCHEMA_TABLES: readonly string[] = [
  "media_files",
  "message_variants",
  "messages",
  "outbox",
  "stories",
  "conversations",
  "call_history",
  "settings",
  "gallery_saved",
  "migration_state",
  "sync_state",
];

/**
 * Applies every migration the database has not seen yet. A database written by
 * a newer build is left alone rather than downgraded.
 */
export async function applySchema(database: SqlDatabase): Promise<void> {
  const row = await database.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const current = row?.user_version ?? 0;
  if (current >= SCHEMA_VERSION) return;
  await database.withTransactionAsync(async () => {
    for (const statement of VERSION_1) await database.execAsync(statement);
    await database.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}
