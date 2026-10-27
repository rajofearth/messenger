/**
 * One-time import of the AsyncStorage cache into SQLite.
 *
 * The old store wrote one key per slice under `messenger/v2/`. Migration reads
 * those keys, writes the same shapes through the SQLite writers, and only then
 * removes the old keys. Markers in `migration_state` make every step resumable:
 * a kill after a chat import leaves that chat's marker committed, and a kill
 * after the main import leaves the cleanup to the next launch. Appearance,
 * update dismissal and the pending call stay in AsyncStorage.
 */

import { STORE_NAMESPACE } from "../asyncStorage";
import type {
  CallHistoryRecord,
  ChatRecord,
  MessageRecord,
  OutboxRecord,
  SettingsRecord,
  StoryRecord,
} from "../records";
import type { Store } from "../store";
import { writeChats } from "./chats";
import { writeThread } from "./messages";
import { writeOutbox } from "./outbox";
import {
  writeGallerySaved,
  writeHistory,
  writeSettings,
  writeStories,
} from "./snapshots";
import type { SqlDatabase } from "./types";

export const LEGACY_IMPORTED_KEY = "legacy:imported";
export const LEGACY_COMPLETE_KEY = "legacy:complete";

export function legacyChatKey(chatId: string): string {
  return `chat:${chatId}`;
}

const PREFIX = `${STORE_NAMESPACE}/`;
const MESSAGE_PREFIX = "messages/";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isChat = (value: unknown): value is ChatRecord =>
  isRecord(value) && typeof value.id === "string";

const isMessage = (value: unknown): value is MessageRecord =>
  isRecord(value) && typeof value.id === "string";

const isStory = (value: unknown): value is StoryRecord =>
  isRecord(value) && typeof value.id === "string";

const isHistory = (value: unknown): value is CallHistoryRecord =>
  isRecord(value) && typeof value.id === "string" && isRecord(value.chat);

const isSettings = (value: unknown): value is SettingsRecord => isRecord(value);

const isOutbox = (value: unknown): value is OutboxRecord =>
  isRecord(value) &&
  typeof value.chatId === "string" &&
  isRecord(value.message) &&
  typeof value.message.id === "string";

function arrayOf<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
): T[] | undefined {
  return Array.isArray(value) ? value.filter(guard) : undefined;
}

function legacySlice(raw: string): string | undefined {
  return raw.startsWith(PREFIX) ? raw.slice(PREFIX.length) : undefined;
}

function isLegacyKey(key: string): boolean {
  return (
    key === "chats" ||
    key === "stories" ||
    key === "outbox" ||
    key === "settings" ||
    key === "history" ||
    key === "gallery-saved" ||
    key.startsWith(MESSAGE_PREFIX)
  );
}

async function hasMarker(
  database: SqlDatabase,
  key: string,
): Promise<boolean> {
  const row = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM migration_state WHERE key = ?",
    key,
  );
  return row !== null && row !== undefined;
}

async function setMarker(database: SqlDatabase, key: string): Promise<void> {
  await database.runAsync(
    `INSERT INTO migration_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    "1",
  );
}

/** Chat ids that have a persisted thread in the old store. */
async function legacyChatIds(store: Store): Promise<string[]> {
  const ids = new Set<string>();
  for (const raw of await store.keys()) {
    const key = legacySlice(raw);
    if (!key?.startsWith(MESSAGE_PREFIX)) continue;
    const chatId = key.slice(MESSAGE_PREFIX.length);
    if (chatId) ids.add(chatId);
  }
  return [...ids].sort();
}

async function importChats(
  database: SqlDatabase,
  store: Store,
): Promise<void> {
  for (const chatId of await legacyChatIds(store)) {
    if (await hasMarker(database, legacyChatKey(chatId))) continue;
    const stored = await store.load<unknown>(`${MESSAGE_PREFIX}${chatId}`);
    const messages = arrayOf(stored, isMessage) ?? [];
    await database.withTransactionAsync(async () => {
      await writeThread(database, chatId, messages);
      await setMarker(database, legacyChatKey(chatId));
    });
  }
}

async function importSlices(database: SqlDatabase, store: Store): Promise<void> {
  const keys = [
    "chats",
    "stories",
    "history",
    "settings",
    "gallery-saved",
    "outbox",
  ] as const;
  const [
    storedChats,
    storedStories,
    storedHistory,
    storedSettings,
    storedGallery,
    storedOutbox,
  ] = await Promise.all(keys.map((key) => store.load<unknown>(key)));

  await database.withTransactionAsync(async () => {
    const chats = arrayOf(storedChats, isChat);
    if (chats?.length) await writeChats(database, chats);

    const stories = arrayOf(storedStories, isStory);
    if (stories) await writeStories(database, stories);

    const history = arrayOf(storedHistory, isHistory);
    if (history) await writeHistory(database, history);

    if (isSettings(storedSettings)) {
      await writeSettings(database, storedSettings);
    }

    const gallery = Array.isArray(storedGallery)
      ? storedGallery.filter((id): id is string => typeof id === "string")
      : undefined;
    if (gallery) await writeGallerySaved(database, gallery);

    // Last, so every pending row already has its conversation.
    const outbox = arrayOf(storedOutbox, isOutbox);
    if (outbox) await writeOutbox(database, outbox);

    await setMarker(database, LEGACY_IMPORTED_KEY);
  });
}

async function deleteLegacyKeys(store: Store): Promise<void> {
  for (const raw of await store.keys()) {
    const key = legacySlice(raw);
    if (key && isLegacyKey(key)) await store.save(key, null);
  }
}

/** Imports the old cache once, then removes it. Safe to call on every launch. */
export async function migrateLegacy(
  database: SqlDatabase,
  store: Store,
): Promise<void> {
  if (await hasMarker(database, LEGACY_COMPLETE_KEY)) return;

  if (!(await hasMarker(database, LEGACY_IMPORTED_KEY))) {
    await importChats(database, store);
    await importSlices(database, store);
  }

  await deleteLegacyKeys(store);
  await setMarker(database, LEGACY_COMPLETE_KEY);
}
