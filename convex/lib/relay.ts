/**
 * Pure relay rules: caps, expiry, envelope serialisation and purge batching.
 *
 * Nothing here touches a Convex context, so `scripts/relay.test.mjs` can import
 * it directly and the queue's arithmetic lives in one place instead of being
 * spread through `convex/relay.ts`.
 */

/** Queue rows one recipient may hold before a send is refused. */
export const MAX_QUEUED_ENTRIES = 200;
/** Queued attachment bytes one recipient may hold. */
export const MAX_QUEUED_BYTES = 10 * 1024 * 1024;
/** Larger files are refused before they ever reach the queue. */
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
/** Nothing survives delivery, and nothing waits longer than 30 days. */
export const RELAY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PULL_DEFAULT = 100;
export const PULL_MAX = 200;
/** Rows one purge sweep may delete, so a sweep stays inside one mutation. */
export const PURGE_BATCH = 200;
/** One envelope is one document; a longer paste would exceed the document cap. */
export const MAX_TEXT_LENGTH = 8000;

export type RelayOp = "message" | "reaction" | "delete";
export type RelayAttachmentKind = "image" | "video" | "audio" | "file";

export type RelayVariant = {
  name: string;
  width: number;
  height: number;
  mimeType: string;
  /** Named `uri` to match the client's ImageVariant, which the receipt feeds. */
  uri: string;
};

export type RelayReply = { id: string; text: string; mine: boolean };

export type RelayMessage = {
  id: string;
  text?: string;
  kind?: RelayAttachmentKind;
  uri?: string;
  variants?: RelayVariant[];
  filename?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number;
  replyTo?: RelayReply;
};

/** The wire shape the phone parses; keep it in step with the client reader. */
export type RelayEnvelope = {
  queueId: string;
  conversationId: string;
  op: RelayOp;
  sequence: number;
  senderId: string;
  createdAt: number;
  message?: RelayMessage;
  targetMessageId?: string;
  reactionKey?: string;
};

export type QueueBudget = { count: number; bytes: number };

export function relayExpiresAt(now: number): number {
  return now + RELAY_TTL_MS;
}

export function envelopeJson(envelope: RelayEnvelope): string {
  return JSON.stringify(envelope);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKind(value: unknown): value is RelayAttachmentKind {
  return value === "image" || value === "video" || value === "audio" ||
    value === "file";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readVariant(value: unknown): RelayVariant | null {
  if (!isRecord(value)) return null;
  const { name, width, height, mimeType, uri } = value;
  if (typeof name !== "string" || !name) return null;
  if (typeof mimeType !== "string" || !mimeType) return null;
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) return null;
  // A variant without a URL can never be shown, so it is not a variant.
  if (typeof uri !== "string" || !uri) return null;
  return { name, width, height, mimeType, uri };
}

function readReply(value: unknown): RelayReply | null {
  if (!isRecord(value)) return null;
  const { id, text, mine } = value;
  if (typeof id !== "string" || !id) return null;
  if (typeof text !== "string") return null;
  if (typeof mine !== "boolean") return null;
  return { id, text, mine };
}

function readMessage(value: unknown): RelayMessage | null {
  if (!isRecord(value)) return null;
  const { id } = value;
  if (typeof id !== "string" || !id) return null;
  const message: RelayMessage = { id };
  if (value.text !== undefined) {
    if (typeof value.text !== "string") return null;
    message.text = value.text;
  }
  if (value.kind !== undefined) {
    if (!isKind(value.kind)) return null;
    message.kind = value.kind;
  }
  if (value.uri !== undefined) {
    if (typeof value.uri !== "string") return null;
    message.uri = value.uri;
  }
  if (value.filename !== undefined) {
    if (typeof value.filename !== "string") return null;
    message.filename = value.filename;
  }
  if (value.mimeType !== undefined) {
    if (typeof value.mimeType !== "string") return null;
    message.mimeType = value.mimeType;
  }
  for (const key of ["width", "height", "duration"] as const) {
    const number = value[key];
    if (number === undefined) continue;
    if (!isFiniteNumber(number)) return null;
    message[key] = number;
  }
  if (value.variants !== undefined) {
    if (!Array.isArray(value.variants)) return null;
    const variants: RelayVariant[] = [];
    for (const item of value.variants) {
      const variant = readVariant(item);
      if (!variant) return null;
      variants.push(variant);
    }
    message.variants = variants;
  }
  if (value.replyTo !== undefined) {
    const replyTo = readReply(value.replyTo);
    if (!replyTo) return null;
    message.replyTo = replyTo;
  }
  return message;
}

/**
 * Parses a stored envelope. A corrupt row must never fail the pull that would
 * have delivered the rest of the queue, so anything unexpected is `null`.
 */
export function parseEnvelope(json: string): RelayEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const { queueId, conversationId, senderId, sequence, createdAt, op } = parsed;
  if (typeof queueId !== "string" || !queueId) return null;
  if (typeof conversationId !== "string" || !conversationId) return null;
  if (typeof senderId !== "string" || !senderId) return null;
  if (op !== "message" && op !== "reaction" && op !== "delete") return null;
  if (!isFiniteNumber(sequence)) return null;
  if (!isFiniteNumber(createdAt)) return null;
  const envelope: RelayEnvelope = {
    queueId,
    conversationId,
    op,
    sequence,
    senderId,
    createdAt,
  };
  if (parsed.targetMessageId !== undefined) {
    if (typeof parsed.targetMessageId !== "string" || !parsed.targetMessageId) {
      return null;
    }
    envelope.targetMessageId = parsed.targetMessageId;
  }
  if (parsed.reactionKey !== undefined) {
    if (typeof parsed.reactionKey !== "string") return null;
    envelope.reactionKey = parsed.reactionKey;
  }
  // An op without its target, or a message without its payload, cannot be
  // applied by the phone, so the row counts as malformed.
  if (op === "message") {
    const message = readMessage(parsed.message);
    if (!message) return null;
    envelope.message = message;
    return envelope;
  }
  if (!envelope.targetMessageId) return null;
  return envelope;
}

export function queueBudget(entries: readonly { bytes: number }[]): QueueBudget {
  let bytes = 0;
  for (const entry of entries) bytes += entry.bytes;
  return { count: entries.length, bytes };
}

/** True when one more row of `bytes` still fits both caps. */
export function mayEnqueue(
  budget: QueueBudget,
  incoming: { bytes: number },
): boolean {
  if (budget.count + 1 > MAX_QUEUED_ENTRIES) return false;
  return budget.bytes + incoming.bytes <= MAX_QUEUED_BYTES;
}

/** Splits a sweep into batches so one mutation never deletes more than the cap. */
export function chunkForPurge<T>(
  items: readonly T[],
  size: number = PURGE_BATCH,
): T[][] {
  const step = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += step) {
    chunks.push(items.slice(index, index + step));
  }
  return chunks;
}
