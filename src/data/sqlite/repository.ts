/**
 * The SQLite-backed implementation of the messenger repository.
 *
 * Reads go straight to the connection; writes join one promise chain, so two
 * saves from different screens cannot interleave their statements or open a
 * nested transaction. The store still owns the slices that must be readable
 * before the database opens: the startup theme, the dismissed release and the
 * pending incoming call. The notification ledger keeps its own store over the
 * same driver.
 *
 * The whole-list slices at the top (stories, call history, settings and gallery
 * markers) live here because this facade is their only caller; their writes
 * replace the stored set instead of upserting like the paged writers.
 */

import type { ImageVariant } from "../../domain/data";
import type { ThemePreference } from "../../ui/theme";
import { normalizeAppearance } from "../appearance";
import type {
  CallHistoryRecord,
  ChatRecord,
  MessageRecord,
  OutboxRecord,
  PendingCallRecord,
  SettingsRecord,
  StoryRecord,
  UpdateRecord,
} from "../records";
import type { Store } from "../store";
import { deleteConversation, listChats, writeChats } from "./chats";
import { STORY_COLUMNS } from "./columns";
import type { MediaFileRow } from "./media";
import { mediaVariantFromRow, replaceStoryMedia, storyMedia } from "./media";
import {
  hasOlderThread,
  readOlderThread,
  readThread,
  removeMessage,
  resetThread,
  writeThread,
} from "./messages";
import { listOutbox, writeOutbox } from "./outbox";
import {
  listPendingAcks,
  removePendingAcks,
  writeRelayBatch,
  writeRelayDelete,
  writeRelayReaction,
} from "./relay";
import {
  callHistoryFromRow,
  callHistoryParams,
  settingsFromRow,
  settingsParams,
  storyFromRow,
  storyParams,
} from "./rows";
import type { CallHistoryRow, SettingsRow, StoryRow } from "./rowTypes";
import { SCHEMA_TABLES } from "./schema";
import type { SqlDatabase } from "./types";

async function listStories(
  database: SqlDatabase,
): Promise<StoryRecord[] | undefined> {
  const rows = await database.getAllAsync<StoryRow>(
    "SELECT * FROM stories ORDER BY position ASC, id ASC",
  );
  if (!rows.length) return undefined;
  const media = await database.getAllAsync<MediaFileRow>(
    `SELECT * FROM media_files
     WHERE story_id IS NOT NULL AND variant IS NOT NULL
     ORDER BY story_id ASC, width ASC, variant ASC`,
  );
  const variants = new Map<string, ImageVariant[]>();
  for (const row of media) {
    if (!row.story_id) continue;
    const variant = mediaVariantFromRow(row);
    if (!variant) continue;
    const current = variants.get(row.story_id);
    if (current) current.push(variant);
    else variants.set(row.story_id, [variant]);
  }
  return rows.map((row) => storyFromRow(row, variants.get(row.id) ?? []));
}

async function writeStories(
  database: SqlDatabase,
  stories: readonly StoryRecord[],
): Promise<void> {
  await database.runAsync("DELETE FROM stories");
  for (const [position, story] of stories.entries()) {
    await database.runAsync(
      `INSERT INTO stories (${STORY_COLUMNS.join(", ")})
       VALUES (${STORY_COLUMNS.map(() => "?").join(", ")})`,
      ...storyParams(story, position),
    );
    await replaceStoryMedia(database, story.id, storyMedia(story));
  }
}

async function listHistory(
  database: SqlDatabase,
): Promise<CallHistoryRecord[] | undefined> {
  const rows = await database.getAllAsync<CallHistoryRow>(
    "SELECT * FROM call_history ORDER BY position ASC, id ASC",
  );
  const history = rows.flatMap((row) => {
    const record = callHistoryFromRow(row);
    return record ? [record] : [];
  });
  return history.length ? history : undefined;
}

async function writeHistory(
  database: SqlDatabase,
  history: readonly CallHistoryRecord[],
): Promise<void> {
  await database.runAsync("DELETE FROM call_history");
  for (const [position, record] of history.entries()) {
    await database.runAsync(
      `INSERT INTO call_history (id, chat, video, seconds, time, missed, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ...callHistoryParams(record, position),
    );
  }
}

async function readSettings(
  database: SqlDatabase,
): Promise<SettingsRecord | undefined> {
  const row = await database.getFirstAsync<SettingsRow>(
    "SELECT * FROM settings WHERE id = 1",
  );
  return row ? settingsFromRow(row) : undefined;
}

async function writeSettings(
  database: SqlDatabase,
  settings: SettingsRecord,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO settings
       (id, name, bio, username, haptics, avatar, sound, previews, system_notifications)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       bio = excluded.bio,
       username = excluded.username,
       haptics = excluded.haptics,
       avatar = excluded.avatar,
       sound = excluded.sound,
       previews = excluded.previews,
       system_notifications = excluded.system_notifications`,
    ...settingsParams(settings),
  );
}

async function listGallerySaved(
  database: SqlDatabase,
): Promise<string[] | undefined> {
  const rows = await database.getAllAsync<{ id: string }>(
    "SELECT id FROM gallery_saved ORDER BY rowid ASC",
  );
  return rows.length ? rows.map((row) => row.id) : undefined;
}

async function writeGallerySaved(
  database: SqlDatabase,
  ids: readonly string[],
): Promise<void> {
  await database.runAsync("DELETE FROM gallery_saved");
  for (const id of ids) {
    await database.runAsync(
      "INSERT OR REPLACE INTO gallery_saved (id) VALUES (?)",
      id,
    );
  }
}

export type MessengerRepository = ReturnType<typeof createMessengerRepository>;

export function createMessengerRepository(
  store: Store,
  database: Promise<SqlDatabase>,
) {
  let tail: Promise<unknown> = Promise.resolve();

  /** Runs every operation after the previous write, and never nests a transaction. */
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function read<T>(task: (database: SqlDatabase) => Promise<T>): Promise<T> {
    return enqueue(async () => task(await database));
  }

  function write<T>(task: (database: SqlDatabase) => Promise<T>): Promise<T> {
    return enqueue(async () => {
      const connection = await database;
      let result!: T;
      await connection.withTransactionAsync(async () => {
        result = await task(connection);
      });
      return result;
    });
  }

  return {
    store,
    loadAppearance: async () =>
      normalizeAppearance(await store.load<unknown>("appearance")),
    saveAppearance: (theme: ThemePreference) =>
      enqueue(() => store.save("appearance", { theme })),

    loadChats: () => read(listChats),
    saveChats: (chats: ChatRecord[]) =>
      write((connection) => writeChats(connection, chats)),

    loadStories: () => read(listStories),
    saveStories: (stories: StoryRecord[]) =>
      write((connection) => writeStories(connection, stories)),

    loadHistory: () => read(listHistory),
    saveHistory: (history: CallHistoryRecord[]) =>
      write((connection) => writeHistory(connection, history)),

    loadSettings: () => read(readSettings),
    saveSettings: (settings: SettingsRecord) =>
      write((connection) => writeSettings(connection, settings)),

    /** Message ids already copied to the device gallery, so retries do not duplicate. */
    loadGallerySaved: () => read(listGallerySaved),
    saveGallerySaved: (ids: string[]) =>
      write((connection) => writeGallerySaved(connection, ids)),

    /** The newest confirmed page plus this device's pending sends. */
    loadMessages: (chatId: string) =>
      read((connection) => readThread(connection, chatId)),
    saveMessages: (chatId: string, messages: MessageRecord[]) =>
      write((connection) => writeThread(connection, chatId, messages)),
    /**
     * One scroll-to-the-top page, newest-first inside the cursor, and whether
     * anything older than that page exists.
     */
    loadOlderMessages: (chatId: string, beforeSequence: number, limit?: number) =>
      read((connection) =>
        readOlderThread(connection, chatId, beforeSequence, limit),
      ),
    hasOlderMessages: (chatId: string, beforeSequence: number) =>
      read((connection) => hasOlderThread(connection, chatId, beforeSequence)),
    clearMessages: (chatId: string) =>
      write((connection) => resetThread(connection, chatId)),
    /** Delete-for-me: the row goes and a durable tombstone keeps it gone. */
    deleteMessage: (chatId: string, messageId: string) =>
      write((connection) => removeMessage(connection, chatId, messageId)),
    /**
     * Deleting a conversation empties its thread and queue but keeps the row
     * as a tombstone, so a page or receipt already in flight cannot recreate
     * the chat with default columns.
     */
    removeMessages: (chatId: string) =>
      write((connection) => deleteConversation(connection, chatId)),

    /**
     * One pulled relay batch: the message rows, the inbox head and one ack row
     * per queue id commit together, so the ack can follow the commit safely.
     */
    saveRelayBatch: (
      chatId: string,
      messages: MessageRecord[],
      queueIds: string[],
    ) =>
      write((connection) =>
        writeRelayBatch(connection, chatId, messages, queueIds),
      ),
    applyRelayReaction: (
      chatId: string,
      messageId: string,
      reaction: string | undefined,
    ) =>
      write((connection) =>
        writeRelayReaction(connection, chatId, messageId, reaction),
      ),
    applyRelayDelete: (chatId: string, messageId: string) =>
      write((connection) => writeRelayDelete(connection, chatId, messageId)),
    /** Envelopes committed locally but not acknowledged to the server yet. */
    loadPendingAcks: () => read(listPendingAcks),
    clearPendingAcks: (queueIds: string[]) =>
      write((connection) => removePendingAcks(connection, queueIds)),

    /** Unsent outgoing messages, separate from the confirmed thread cache. */
    loadOutbox: () => read(listOutbox),
    saveOutbox: (records: OutboxRecord[]) =>
      write((connection) => writeOutbox(connection, records)),

    loadPendingCall: () => store.load<PendingCallRecord>("pending-call"),
    savePendingCall: (call: PendingCallRecord | null) =>
      enqueue(() => store.save("pending-call", call)),
    loadDismissedRelease: () => store.load<UpdateRecord>("update"),
    saveDismissedRelease: (record: UpdateRecord | null) =>
      enqueue(() => store.save("update", record)),

    /** Signing out must not leave one account's data for the next one. */
    clearAccountData: () =>
      enqueue(async () => {
        const connection = await database;
        await connection.withTransactionAsync(async () => {
          for (const table of SCHEMA_TABLES) {
            await connection.runAsync(`DELETE FROM ${table}`);
          }
        });
        // Checkpoint outside the transaction so the WAL is actually truncated.
        try {
          await connection.execAsync("PRAGMA wal_checkpoint(TRUNCATE)");
        } finally {
          await store.clear();
        }
      }),
  };
}
