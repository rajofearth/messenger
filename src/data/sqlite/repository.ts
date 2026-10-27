/**
 * The SQLite-backed implementation of the messenger repository.
 *
 * Reads go straight to the connection; writes join one promise chain, so two
 * saves from different screens cannot interleave their statements or open a
 * nested transaction. The store is still used for the three slices that must
 * live outside SQLite: the startup theme, the dismissed release and the
 * pending incoming call.
 */

import type { ThemePreference } from "../../ui/theme";
import { normalizeAppearance } from "../appearance";
import type {
  AppearanceRecord,
  CallHistoryRecord,
  ChatRecord,
  LegacyAppearanceRecord,
  MessageRecord,
  OutboxRecord,
  PendingCallRecord,
  SettingsRecord,
  StoryRecord,
  UpdateRecord,
} from "../records";
import type { Store } from "../store";
import { deleteConversation, listChats, writeChats } from "./chats";
import {
  exhaustThread,
  hasOlderThread,
  readOlderThread,
  readThread,
  removeMessage,
  resetThread,
  writeThread,
} from "./messages";
import { listOutbox, writeOutbox } from "./outbox";
import { SCHEMA_TABLES } from "./schema";
import {
  listGallerySaved,
  listHistory,
  listStories,
  readSettings,
  writeGallerySaved,
  writeHistory,
  writeSettings,
  writeStories,
} from "./snapshots";
import type { SqlDatabase } from "./types";

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
      normalizeAppearance(
        await store.load<AppearanceRecord | LegacyAppearanceRecord>("appearance"),
      ),
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
    loadOlderMessages: (chatId: string, beforeSequence: number) =>
      read((connection) => readOlderThread(connection, chatId, beforeSequence)),
    threadHasOlder: (chatId: string) =>
      read((connection) => hasOlderThread(connection, chatId)),
    markThreadExhausted: (chatId: string) =>
      write((connection) => exhaustThread(connection, chatId)),
    clearMessages: (chatId: string) =>
      write((connection) => resetThread(connection, chatId)),
    deleteMessage: (chatId: string, messageId: string) =>
      write((connection) => removeMessage(connection, chatId, messageId)),
    /** Deleting a conversation cascades its messages, media and queue rows. */
    removeMessages: (chatId: string) =>
      write((connection) => deleteConversation(connection, chatId)),

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
