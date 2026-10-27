/**
 * The media index behind messages and stories.
 *
 * It is written from the same values the screens already render, so usage
 * accounting can answer "which files does this chat own" without the UI
 * needing a second bookkeeping path. One row per stored file: the original,
 * the downloaded preview, and every remote width.
 */

import type { ImageVariant, Message, Story } from "../../domain/data";
import type { SqlValue } from "./types";
import type { SqlDatabase } from "./types";

export type MediaFileRow = {
  id: string;
  message_id: string | null;
  story_id: string | null;
  variant: string | null;
  remote_uri: string | null;
  local_path: string | null;
  mime_type: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  state: string | null;
};

export type MediaEntry = {
  id: string;
  messageId?: string;
  storyId?: string;
  variant?: string;
  remoteUri?: string;
  localPath?: string;
  mimeType?: string;
  width?: number;
  height?: number;
};

const LOCAL_URI = /^(file|content|asset|data):/i;

const isLocal = (uri: string) => LOCAL_URI.test(uri);

function entryValues(entry: MediaEntry): SqlValue[] {
  const local = entry.localPath !== undefined;
  return [
    entry.id,
    entry.messageId ?? null,
    entry.storyId ?? null,
    entry.variant ?? null,
    local ? null : (entry.remoteUri ?? null),
    entry.localPath ?? null,
    entry.mimeType ?? null,
    null,
    entry.width ?? null,
    entry.height ?? null,
    local ? "local" : "remote",
  ];
}

const MEDIA_COLUMNS =
  "id, message_id, story_id, variant, remote_uri, local_path, mime_type, bytes, width, height, state";

function placeholders(rows: number, columns: number) {
  const row = `(${Array.from({ length: columns }, () => "?").join(", ")})`;
  return Array.from({ length: rows }, () => row).join(", ");
}

async function insertEntries(
  database: SqlDatabase,
  entries: readonly MediaEntry[],
): Promise<void> {
  if (!entries.length) return;
  const values = entries.flatMap(entryValues);
  await database.runAsync(
    `INSERT INTO media_files (${MEDIA_COLUMNS}) VALUES ${placeholders(entries.length, 11)}`,
    ...values,
  );
}

export function messageMedia(message: Message): MediaEntry[] {
  const entries = new Map<string, MediaEntry>();
  const original = message.uri;
  if (original) {
    const local = isLocal(original);
    entries.set(`message:${message.id}:source`, {
      id: `message:${message.id}:source`,
      messageId: message.id,
      remoteUri: local ? undefined : original,
      localPath: local ? original : undefined,
      mimeType: message.mimeType,
      width: message.width,
      height: message.height,
    });
  }
  if (message.previewUri) {
    entries.set(`message:${message.id}:preview`, {
      id: `message:${message.id}:preview`,
      messageId: message.id,
      variant: "preview",
      localPath: message.previewUri,
      mimeType: message.mimeType,
      width: message.previewWidth,
      height: message.height,
    });
  }
  for (const variant of message.variants ?? []) {
    if (!variant.uri) continue;
    const local = isLocal(variant.uri);
    entries.set(`message:${message.id}:variant:${variant.name}`, {
      id: `message:${message.id}:variant:${variant.name}`,
      messageId: message.id,
      variant: variant.name,
      remoteUri: local ? undefined : variant.uri,
      localPath: local ? variant.uri : undefined,
      mimeType: variant.mimeType ?? message.mimeType,
      width: variant.width,
      height: variant.height,
    });
  }
  return [...entries.values()];
}

export function storyMedia(story: Story): MediaEntry[] {
  const entries = new Map<string, MediaEntry>();
  const original = story.image;
  if (original) {
    const local = isLocal(original);
    entries.set(`story:${story.id}:source`, {
      id: `story:${story.id}:source`,
      storyId: story.id,
      remoteUri: local ? undefined : original,
      localPath: local ? original : undefined,
      mimeType: story.mimeType,
      width: story.width,
      height: story.height,
    });
  }
  if (story.previewUri) {
    entries.set(`story:${story.id}:preview`, {
      id: `story:${story.id}:preview`,
      storyId: story.id,
      variant: "preview",
      localPath: story.previewUri,
      mimeType: story.mimeType,
      width: story.previewWidth,
      height: story.height,
    });
  }
  for (const variant of story.variants ?? []) {
    if (!variant.uri) continue;
    const local = isLocal(variant.uri);
    entries.set(`story:${story.id}:variant:${variant.name}`, {
      id: `story:${story.id}:variant:${variant.name}`,
      storyId: story.id,
      variant: variant.name,
      remoteUri: local ? undefined : variant.uri,
      localPath: local ? variant.uri : undefined,
      mimeType: variant.mimeType ?? story.mimeType,
      width: variant.width,
      height: variant.height,
    });
  }
  return [...entries.values()];
}

export async function replaceMessageMedia(
  database: SqlDatabase,
  messageId: string,
  entries: readonly MediaEntry[],
): Promise<void> {
  await database.runAsync(
    "DELETE FROM media_files WHERE message_id = ?",
    messageId,
  );
  await insertEntries(database, entries);
}

export async function replaceStoryMedia(
  database: SqlDatabase,
  storyId: string,
  entries: readonly MediaEntry[],
): Promise<void> {
  await database.runAsync("DELETE FROM media_files WHERE story_id = ?", storyId);
  await insertEntries(database, entries);
}

/** The remote widths of a story, smallest first. */
export function mediaVariantFromRow(
  row: MediaFileRow,
): ImageVariant | undefined {
  if (!row.variant || row.variant === "preview") return undefined;
  const uri = row.remote_uri ?? row.local_path;
  if (!uri || row.width === null || row.height === null) return undefined;
  return {
    name: row.variant,
    uri,
    width: row.width,
    height: row.height,
    mimeType: row.mime_type ?? undefined,
  };
}
