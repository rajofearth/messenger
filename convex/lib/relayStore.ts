/**
 * Context-bound helpers for the relay queue: membership, sequence allocation,
 * attachment lookup, fan-out and blob release.
 *
 * They sit beside `lib/relay.ts` instead of inside it because the pure rules
 * are imported by a test that must never pull in a Convex server context.
 */

import { ConvexError } from "convex/values";
import { components, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { requireUser } from "./identity";
import { deleteMediaVariants, readMediaVariants } from "./mediaVariants";
import { shouldDeleteBlob } from "./retention";
import {
  MAX_ATTACHMENT_BYTES,
  envelopeJson,
  mayEnqueue,
  queueBudget,
  relayExpiresAt,
  type RelayAttachmentKind,
  type RelayEnvelope,
  type RelayMessage,
  type RelayVariant,
} from "./relay";

export type Actor = Awaited<ReturnType<typeof requireUser>>;

export type Attachment = {
  kind: RelayAttachmentKind;
  filename: string;
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
  /** Resolved for the sender's receipt; a recipient resolves it again on pull. */
  url: string;
  variants?: RelayVariant[];
};

type EnqueueInput = {
  conversationId: string;
  senderUserId: Id<"users">;
  senderSubjectId: string;
  /** Client message id for a message, empty for an op. */
  messageId: string;
  op: RelayEnvelope["op"];
  sequence: number;
  bytes: number;
  createdAt: number;
  storageId?: Id<"_storage">;
  message?: RelayMessage;
  targetMessageId?: string;
  reactionKey?: string;
};

/** Mirrors `convex/chat.ts`, which derives the bubble kind from the MIME type. */
function attachmentKind(mediaType: string): RelayAttachmentKind {
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType.startsWith("video/")) return "video";
  if (mediaType.startsWith("audio/")) return "audio";
  return "file";
}

export function envelopeVariant(
  variant: Awaited<ReturnType<typeof readMediaVariants>>[number],
): RelayVariant {
  return {
    name: variant.name,
    width: variant.width,
    height: variant.height,
    mimeType: variant.mimeType,
    uri: variant.uri,
  };
}

async function conversationMeta(
  ctx: MutationCtx,
  conversationId: string,
): Promise<Doc<"conversationMeta"> | null> {
  return await ctx.db
    .query("conversationMeta")
    .withIndex("by_conversationId", (q) => q.eq("conversationId", conversationId))
    .unique();
}

/**
 * Membership is mirrored in `conversationMeta`, so the relay never needs the
 * chat component to decide who a message goes to. Unknown conversation and
 * non-membership look the same from outside, which keeps ids unguessable.
 */
export async function memberConversation(
  ctx: MutationCtx,
  actor: Actor,
  conversationId: string,
): Promise<Doc<"conversationMeta">> {
  const meta = await conversationMeta(ctx, conversationId);
  if (!meta || !meta.memberSubjectIds.includes(actor.subjectId)) {
    throw new ConvexError({ code: "CONVERSATION_NOT_FOUND" });
  }
  // The relay is a second write path, so it enforces the same block rule as
  // `chat.canWrite`: otherwise a blocked peer could still send, react or delete.
  const preference = await ctx.db
    .query("conversationPreferences")
    .withIndex("by_user_conversation", (q) =>
      q.eq("userId", actor.userId).eq("conversationId", conversationId),
    )
    .unique();
  if (preference?.blocked) throw new ConvexError({ code: "CONVERSATION_BLOCKED" });
  if (meta.kind === "direct") {
    for (const peerId of meta.memberSubjectIds) {
      if (peerId === actor.subjectId) continue;
      const peerPreference = await ctx.db
        .query("conversationPreferences")
        .withIndex("by_user_conversation", (q) =>
          q
            .eq("userId", peerId as Id<"users">)
            .eq("conversationId", conversationId),
        )
        .unique();
      if (peerPreference?.blocked) {
        throw new ConvexError({ code: "BLOCKED_BY_PEER" });
      }
    }
  }
  return meta;
}

export function recipientsOf(
  meta: Doc<"conversationMeta">,
  actor: Actor,
): Id<"users">[] {
  // The sender is skipped entirely: one row per other member, and no row for
  // the sender's own other devices, which is the v1 single-history-device rule.
  return meta.memberSubjectIds
    .filter((subjectId) => subjectId !== actor.subjectId)
    .map((subjectId) => subjectId as Id<"users">);
}

/**
 * The counter stores the last number handed out, so a fresh conversation starts
 * at 1. Its first value is seeded from the chat component once, which keeps
 * relay messages in order with the history written before the relay existed.
 * Patching the same meta row is what separates two concurrent sends: Convex
 * re-runs the losing mutation against the patched document.
 */
export async function allocateSequence(
  ctx: MutationCtx,
  meta: Doc<"conversationMeta">,
  actor: Actor,
): Promise<number> {
  // The component can still advance while the relay is in use, because a
  // forward writes there. Reading the newest component sequence on every send
  // and taking the larger of the two keeps one number space per conversation,
  // which is what `mergeThread` and the paging cursors assume.
  const newest = await ctx.runQuery(components.chat.messages.list, {
    scopeId: actor.scopeId,
    subjectId: actor.subjectId,
    conversationId: meta.conversationId,
    limit: 1,
  });
  const last = Math.max(meta.nextSequence ?? 0, newest[0]?.sequence ?? 0);
  const sequence = last + 1;
  await ctx.db.patch(meta._id, { nextSequence: sequence });
  return sequence;
}

export async function attachmentFor(
  ctx: MutationCtx,
  actor: Actor,
  storageId: Id<"_storage">,
): Promise<Attachment> {
  const file = await ctx.db
    .query("files")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .unique();
  // An upload owned by someone else is reported as missing, not forbidden, so
  // the error carries no hint that the blob exists.
  if (!file || file.ownerId !== actor.userId) {
    throw new ConvexError({ code: "ATTACHMENT_NOT_FOUND" });
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new ConvexError({
      code: "QUEUE_MEDIA_TOO_LARGE",
      bytes: file.size,
      limit: MAX_ATTACHMENT_BYTES,
    });
  }
  const url = await ctx.storage.getUrl(storageId);
  if (!url) throw new ConvexError({ code: "ATTACHMENT_NOT_FOUND" });
  const kind = attachmentKind(file.mimeType);
  const variants = kind === "image" ? await readMediaVariants(ctx, storageId) : [];
  return {
    kind,
    filename: file.filename,
    mimeType: file.mimeType,
    bytes: file.size,
    width: file.width,
    height: file.height,
    // The thread shows seconds everywhere else, so convert once here.
    duration: file.durationMs ? file.durationMs / 1000 : undefined,
    url,
    variants: variants.length ? variants.map(envelopeVariant) : undefined,
  };
}

async function lastSeenAt(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<number | null> {
  const devices = await ctx.db
    .query("devices")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  let newest: number | undefined;
  for (const device of devices) {
    if (device.revokedAt !== undefined) continue;
    if (newest === undefined || device.lastSeenAt > newest) {
      newest = device.lastSeenAt;
    }
  }
  return newest ?? null;
}

/**
 * Writes one row per recipient and wakes each of them once. The queue id is the
 * row id, so acknowledgement and the push wake name the same row without a
 * second random source. The placeholder write is patched before the mutation
 * commits, so no reader ever sees an empty envelope.
 */
export async function fanOut(
  ctx: MutationCtx,
  recipients: Id<"users">[],
  input: EnqueueInput,
): Promise<string[]> {
  const queueIds: string[] = [];
  for (const recipientUserId of recipients) {
    const rows = await ctx.db
      .query("relayQueue")
      .withIndex("by_recipient", (q) => q.eq("recipientUserId", recipientUserId))
      .collect();
    if (!mayEnqueue(queueBudget(rows), { bytes: input.bytes })) {
      throw new ConvexError({
        code: "QUEUE_FULL",
        lastSeenAt: await lastSeenAt(ctx, recipientUserId),
      });
    }
    const rowId = await ctx.db.insert("relayQueue", {
      recipientUserId,
      senderUserId: input.senderUserId,
      conversationId: input.conversationId,
      queueId: "",
      messageId: input.messageId,
      op: input.op,
      sequence: input.sequence,
      envelope: "",
      bytes: input.bytes,
      storageId: input.storageId,
      createdAt: input.createdAt,
      expiresAt: relayExpiresAt(input.createdAt),
    });
    const queueId = String(rowId);
    const envelope: RelayEnvelope = {
      queueId,
      conversationId: input.conversationId,
      op: input.op,
      sequence: input.sequence,
      senderId: input.senderSubjectId,
      createdAt: input.createdAt,
      message: input.message,
      targetMessageId: input.targetMessageId,
      reactionKey: input.reactionKey,
    };
    await ctx.db.patch(rowId, { queueId, envelope: envelopeJson(envelope) });
    queueIds.push(queueId);
  }
  // A wake is a hint, never proof of delivery, so it is scheduled once the rows
  // exist and its result is not awaited beyond the enqueue itself.
  for (const [index, recipientUserId] of recipients.entries()) {
    await ctx.scheduler.runAfter(0, internal.push.wakeUser, {
      userId: recipientUserId,
      queueId: queueIds[index],
    });
  }
  return queueIds;
}

/**
 * Reclaims one attachment once its last queue row is gone. `lib/retention`
 * decides whether the files row may go: an empty ref list means the blob was
 * only ever queued, while a legacy or shared row keeps both the row and bytes.
 */
export async function releaseAttachment(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
): Promise<boolean> {
  const queued = await ctx.db
    .query("relayQueue")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
  if (queued) return false;
  const file = await ctx.db
    .query("files")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .unique();
  if (file && !shouldDeleteBlob(file.messageRefs)) return false;
  if (file) await ctx.db.delete(file._id);
  await deleteMediaVariants(ctx, storageId);
  const metadata = await ctx.db.system.get("_storage", storageId);
  if (metadata) await ctx.storage.delete(storageId);
  return true;
}
