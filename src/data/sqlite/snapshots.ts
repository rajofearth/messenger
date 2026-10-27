/**
 * Whole-list slices: stories, call history, settings and gallery markers.
 *
 * These are server or user snapshots rather than append-only history, so a
 * write replaces the stored set. Messages and conversations use the paged
 * writers in `messages.ts` and `chats.ts` instead.
 */

import type { ImageVariant } from "../../domain/data";
import type {
  CallHistoryRecord,
  SettingsRecord,
  StoryRecord,
} from "../records";
import { mediaVariantFromRow, replaceStoryMedia, storyMedia } from "./media";
import { STORY_COLUMNS } from "./columns";
import {
  callHistoryFromRow,
  callHistoryParams,
  settingsFromRow,
  settingsParams,
  storyFromRow,
  storyParams,
} from "./rows";
import type {
  CallHistoryRow,
  SettingsRow,
  StoryRow,
} from "./rowTypes";
import type { MediaFileRow } from "./media";
import type { SqlDatabase } from "./types";

export async function listStories(
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

export async function writeStories(
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

export async function listHistory(
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

export async function writeHistory(
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

export async function readSettings(
  database: SqlDatabase,
): Promise<SettingsRecord | undefined> {
  const row = await database.getFirstAsync<SettingsRow>(
    "SELECT * FROM settings WHERE id = 1",
  );
  return row ? settingsFromRow(row) : undefined;
}

export async function writeSettings(
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

export async function listGallerySaved(
  database: SqlDatabase,
): Promise<string[] | undefined> {
  const rows = await database.getAllAsync<{ id: string }>(
    "SELECT id FROM gallery_saved ORDER BY rowid ASC",
  );
  return rows.length ? rows.map((row) => row.id) : undefined;
}

export async function writeGallerySaved(
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
