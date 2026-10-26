/**
 * Durable outgoing queue.
 *
 * A picked attachment lives in the gallery or the app cache and its bubble
 * lives in memory, so a kill before the server echo used to lose both. This
 * service keeps a copy of the bytes in app documents and a persisted record of
 * every unconfirmed send. The confirmed thread cache stays untouched: only rows
 * with a server sequence are written there.
 */

import { Directory, File, Paths } from "expo-file-system";
import type { Message } from "../domain/data";
import type { OutboxRecord } from "../data/records";
import { messengerRepository } from "../data/messengerRepository";

const FOLDER = "message-media";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "application/pdf": "pdf",
  "text/plain": "txt",
};

const KIND_EXTENSIONS: Record<string, string> = {
  image: "jpg",
  video: "mp4",
  audio: "m4a",
  file: "bin",
};

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

/** Filename first, then the MIME type, then the message kind. */
function extensionFor(message: Message) {
  const name = message.filename;
  const fromName = name?.includes(".")
    ? name.split(".").pop()?.toLowerCase()
    : undefined;
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  const mimeType = message.mimeType?.toLowerCase();
  const known = mimeType ? MIME_EXTENSIONS[mimeType] : undefined;
  if (known) return known;
  const subtype = mimeType?.split("/")[1]?.replace(/[^a-z0-9]/g, "");
  if (subtype && /^[a-z0-9]{2,5}$/.test(subtype)) {
    return subtype === "jpeg" ? "jpg" : subtype;
  }
  return KIND_EXTENSIONS[message.kind ?? "file"] ?? "bin";
}

function outboxDirectory() {
  const directory = new Directory(Paths.document, FOLDER);
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  return directory;
}

function deleteQuietly(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    // A partial file the OS already removed needs no cleanup.
  }
}

/**
 * Copies a picked file into app documents before it is uploaded and points the
 * bubble at that copy. Bytes are kept unchanged: no transcode, no re-encode.
 * A source that is already in documents is durable and left alone. Returns
 * null when there is no URI, the source is missing or empty, or the copy
 * fails, so the caller fails the send instead of queueing a retry that can
 * never work. A destination from an earlier attempt is reused even when the
 * picker source is gone, which rescues a kill between the copy and the row
 * update.
 */
export async function keepOutgoingCopy(
  message: Message,
): Promise<Message | null> {
  const { uri } = message;
  if (!uri) return null;
  try {
    const destination = new File(
      outboxDirectory(),
      `outbox-${safeName(message.id)}.${extensionFor(message)}`,
    );
    if (destination.exists && destination.size > 0) {
      return { ...message, uri: destination.uri };
    }
    const source = new File(uri);
    if (!source.exists || source.size <= 0) return null;
    if (uri.startsWith(Paths.document.uri)) return message;
    try {
      await source.copy(destination);
    } catch {
      deleteQuietly(destination);
      return null;
    }
    return { ...message, uri: destination.uri };
  } catch {
    return null;
  }
}

let records: OutboxRecord[] | null = null;
let loaded = false;
let generation = 0;
let writes: Promise<void> = Promise.resolve();

/** Persists the full in-memory list, one write at a time. */
function queueWrite() {
  const snapshot = records ? [...records] : [];
  writes = writes
    .catch(() => undefined)
    .then(() => messengerRepository.saveOutbox(snapshot))
    .catch(() => undefined);
  return writes;
}

function put(chatId: string, message: Message) {
  const list = (records ??= []);
  const index = list.findIndex((record) => record.message.id === message.id);
  const record: OutboxRecord = { chatId, message };
  if (index === -1) list.push(record);
  else list[index] = record;
  return queueWrite();
}

/** Shape guard for a persisted row: a chat id and a message id are required. */
function isOutboxRecord(value: unknown): value is OutboxRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<OutboxRecord>;
  return (
    typeof record.chatId === "string" &&
    !!record.message &&
    typeof record.message.id === "string"
  );
}

/**
 * Reads the persisted queue and adopts it as the in-memory list, keeping rows
 * queued while the read was in flight. Called once with the rest of the
 * cold-start cache; signing out clears storage first, so the next account
 * cannot inherit the previous one's pending sends.
 */
export async function loadOutbox(): Promise<OutboxRecord[]> {
  try {
    const stored = await messengerRepository.loadOutbox();
    // A row queued during the read is newer than the stored copy.
    const queued = records ?? [];
    const queuedIds = new Set(queued.map((record) => record.message.id));
    const valid = Array.isArray(stored)
      ? stored.filter(isOutboxRecord)
      : [];
    records = [
      ...valid.filter((record) => !queuedIds.has(record.message.id)),
      ...queued,
    ];
    loaded = true;
  } catch {
    // A failed read must not drop sends already queued in this session.
    records ??= [];
  }
  return records;
}

/**
 * Whether the persisted slice was read successfully. Cleanup only runs then:
 * a failed read must not be mistaken for an empty outbox and delete the
 * durable copies of rows that are still on disk.
 */
export function outboxLoaded(): boolean {
  return loaded;
}

/**
 * Drops the in-memory queue before sign-out and waits for writes already
 * queued. A late upload callback then finds no row and cannot persist a
 * previous account's message after the store was cleared.
 */
export async function clearOutbox(): Promise<void> {
  generation += 1;
  records = null;
  loaded = false;
  await writes.catch(() => undefined);
}

/**
 * Identifies the queue generation a send started in. Sign-out advances it, so
 * an attachment copy that finishes afterwards cannot enqueue into the next
 * account's outbox.
 */
export function outboxGeneration(): number {
  return generation;
}

/**
 * Seeds the queue from the slice loaded with the rest of the cold-start cache.
 * Replacing is deliberate: signing out clears storage, and the next account
 * must not inherit the previous one's pending sends.
 */
export function initializeOutbox(stored: readonly OutboxRecord[]) {
  records = [...stored];
}

export function outboxSnapshot(): OutboxRecord[] {
  return records ? [...records] : [];
}

/**
 * Adds an outgoing message to the queue before its upload starts. A send that
 * began in an earlier queue generation is ignored, so a sign-out during an
 * attachment copy cannot re-enqueue the old account's message.
 */
export function rememberOutgoing(
  chatId: string,
  message: Message,
  startedIn = generation,
): Promise<void> {
  if (startedIn !== generation) return Promise.resolve();
  return put(chatId, message);
}

/**
 * Replaces a remembered message with its latest URI or storage id. A row that
 * is no longer queued — the chat was cleared, or the send was already
 * confirmed — is never re-inserted by a late upload callback.
 */
export function updateOutgoing(
  chatId: string,
  message: Message,
): Promise<void> {
  if (!records) return Promise.resolve();
  const index = records.findIndex(
    (record) => record.message.id === message.id,
  );
  if (index === -1) return Promise.resolve();
  records[index] = { chatId, message };
  return queueWrite();
}

/** Drops a row once the server accepted the send. */
export function forgetOutgoing(messageId: string): Promise<void> {
  if (!records) return Promise.resolve();
  const next = records.filter((record) => record.message.id !== messageId);
  if (next.length === records.length) return Promise.resolve();
  records = next;
  return queueWrite();
}

/** Drops every row for a chat the user cleared or deleted. */
export function forgetChat(chatId: string): Promise<void> {
  if (!records) return Promise.resolve();
  const next = records.filter((record) => record.chatId !== chatId);
  if (next.length === records.length) return Promise.resolve();
  records = next;
  return queueWrite();
}

/** A sent copy is only deleted once it is old enough that the server row has
 * replaced the local bubble; a pending row is always kept by reference. */
const ORPHAN_AGE_MS = 60 * 60 * 1000;

/**
 * Removes durable copies the queue no longer references. Runs after the
 * outbox loads and whenever the app returns to the foreground, so a session
 * that sends many attachments does not keep a second copy of each one.
 */
export function sweepOutboxFiles(now = Date.now()) {
  if (!records) return;
  const keep = new Set<string>();
  for (const record of records) {
    if (record.message.uri) keep.add(record.message.uri);
  }
  let directory: Directory;
  let entries: (Directory | File)[];
  try {
    directory = outboxDirectory();
    entries = directory.list();
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!(entry instanceof File)) continue;
    if (!entry.name.startsWith("outbox-") || keep.has(entry.uri)) continue;
    try {
      const changed = entry.info().modificationTime;
      if (changed !== undefined && now - changed < ORPHAN_AGE_MS) continue;
      entry.delete();
    } catch {
      // A copy another process already removed needs no cleanup.
    }
  }
}
