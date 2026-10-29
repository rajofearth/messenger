import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUser } from "./lib/identity";
import { readMediaVariants } from "./lib/mediaVariants";
import {
  MAX_TEXT_LENGTH,
  PULL_DEFAULT,
  PULL_MAX,
  PURGE_BATCH,
  chunkForPurge,
  parseEnvelope,
  type RelayEnvelope,
  type RelayMessage,
  type RelayReply,
} from "./lib/relay";
import {
  allocateSequence,
  attachmentFor,
  envelopeVariant,
  fanOut,
  memberConversation,
  recipientsOf,
  releaseAttachment,
} from "./lib/relayStore";
export const send = mutation({
  args: {
    conversationId: v.string(),
    clientMessageId: v.string(),
    text: v.optional(v.string()),
    replyToMessageId: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const meta = await memberConversation(ctx, actor, args.conversationId);
    const text = args.text?.trim();
    if (!text && !args.storageId) {
      throw new ConvexError({ code: "MESSAGE_EMPTY" });
    }
    if (text && text.length > MAX_TEXT_LENGTH) {
      // One document holds the whole envelope, so an unbounded paste would fail
      // the insert instead of producing a clear error the client can show.
      throw new ConvexError({
        code: "MESSAGE_TOO_LONG",
        limit: MAX_TEXT_LENGTH,
        length: text.length,
      });
    }
    const attachment = args.storageId
      ? await attachmentFor(ctx, actor, args.storageId)
      : undefined;
    // A retry reuses the client message id. Returning the existing row instead
    // of queueing a second one keeps a lost response from duplicating a message
    // and spending a second sequence number.
    const duplicate = await ctx.db
      .query("relayQueue")
      .withIndex("by_conversation_message", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("messageId", args.clientMessageId),
      )
      .first();
    if (duplicate) {
      const stored = parseEnvelope(duplicate.envelope)?.message;
      return {
        ...(stored ?? { id: args.clientMessageId }),
        sequence: duplicate.sequence,
        createdAt: new Date(duplicate.createdAt).toISOString(),
        uri: attachment?.url,
        variants: attachment?.variants,
      };
    }
    // The contract carries only the quoted id, and the relay keeps no copy of a
    // delivered message, so the text is the same generic fallback the chat
    // component uses. The phone has the real snapshot on its own row.
    const replyTo: RelayReply | undefined = args.replyToMessageId
      ? { id: args.replyToMessageId, text: "Message", mine: false }
      : undefined;
    const createdAt = Date.now();
    const sequence = await allocateSequence(ctx, meta, actor);
    const message: RelayMessage = {
      id: args.clientMessageId,
      text: text || undefined,
      kind: attachment?.kind,
      filename: attachment?.filename,
      mimeType: attachment?.mimeType,
      width: attachment?.width,
      height: attachment?.height,
      duration: attachment?.duration,
      replyTo,
    };
    await fanOut(ctx, recipientsOf(meta, actor), {
      conversationId: args.conversationId,
      senderUserId: actor.userId,
      senderSubjectId: actor.subjectId,
      messageId: args.clientMessageId,
      op: "message",
      sequence,
      bytes: attachment?.bytes ?? 0,
      createdAt,
      storageId: args.storageId,
      message,
    });
    // The receipt is the sender's confirmed view: the stored envelope message
    // plus the attachment URL and variants only this device needs right now.
    return {
      ...message,
      sequence,
      createdAt: new Date(createdAt).toISOString(),
      uri: attachment?.url,
      variants: attachment?.variants,
    };
  },
});

export const react = mutation({
  args: {
    conversationId: v.string(),
    messageId: v.string(),
    reactionKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const meta = await memberConversation(ctx, actor, args.conversationId);
    const createdAt = Date.now();
    const queueIds = await fanOut(ctx, recipientsOf(meta, actor), {
      conversationId: args.conversationId,
      senderUserId: actor.userId,
      senderSubjectId: actor.subjectId,
      messageId: "",
      op: "reaction",
      // An op is not part of the conversation's message order.
      sequence: 0,
      bytes: 0,
      createdAt,
      targetMessageId: args.messageId,
      reactionKey: args.reactionKey,
    });
    return {
      // A self-only conversation has no row, and the target is a stable handle.
      id: queueIds[0] ?? args.messageId,
      sequence: 0,
      createdAt: new Date(createdAt).toISOString(),
    };
  },
});

export const remove = mutation({
  args: { conversationId: v.string(), messageId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const meta = await memberConversation(ctx, actor, args.conversationId);
    const createdAt = Date.now();
    const queueIds = await fanOut(ctx, recipientsOf(meta, actor), {
      conversationId: args.conversationId,
      senderUserId: actor.userId,
      senderSubjectId: actor.subjectId,
      messageId: "",
      op: "delete",
      sequence: 0,
      bytes: 0,
      createdAt,
      targetMessageId: args.messageId,
    });
    return {
      id: queueIds[0] ?? args.messageId,
      sequence: 0,
      createdAt: new Date(createdAt).toISOString(),
    };
  },
});

export const pull = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const requested = Math.floor(args.limit ?? PULL_DEFAULT);
    const limit = Math.min(
      Math.max(1, Number.isFinite(requested) ? requested : PULL_DEFAULT),
      PULL_MAX,
    );
    const rows = await ctx.db
      .query("relayQueue")
      .withIndex("by_recipient", (q) => q.eq("recipientUserId", actor.userId))
      .order("asc")
      .take(limit + 1);
    const page = rows.slice(0, limit);
    const entries: RelayEnvelope[] = [];
    for (const row of page) {
      const envelope = parseEnvelope(row.envelope);
      // A corrupt row is skipped rather than failing the whole page.
      if (!envelope) continue;
      if (row.op !== "message" || !row.storageId) {
        entries.push(envelope);
        continue;
      }
      const message = envelope.message;
      if (!message) continue;
      // Media is resolved per pull because a storage URL is short-lived, so the
      // phone never needs a second round trip for an attachment it receives.
      const uri = await ctx.storage.getUrl(row.storageId);
      // A query cannot delete, so a row whose blob is gone is hidden here and
      // left for the purge, which owns every queue deletion of last resort.
      if (!uri) continue;
      const variants =
        message.kind === "image" ? await readMediaVariants(ctx, row.storageId) : [];
      entries.push({
        ...envelope,
        message: {
          ...message,
          uri,
          variants: variants.length ? variants.map(envelopeVariant) : undefined,
        },
      });
    }
    return { entries, more: rows.length > limit };
  },
});

export const ack = mutation({
  args: { queueIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    // An empty ack is common after a foreground drain of an exhausted queue.
    if (args.queueIds.length === 0) return { acked: 0 };
    const actor = await requireUser(ctx);
    const wanted = new Set(args.queueIds);
    // There is no index on `queueId` because the recipient index already bounds
    // the scan to this user's own rows, which the caps hold under 200.
    const rows = await ctx.db
      .query("relayQueue")
      .withIndex("by_recipient", (q) => q.eq("recipientUserId", actor.userId))
      .collect();
    let acked = 0;
    for (const row of rows) {
      if (!wanted.has(row.queueId)) continue;
      await ctx.db.delete(row._id);
      acked += 1;
      // Deleting the row first keeps the remaining-reference check honest.
      if (row.storageId) await releaseAttachment(ctx, row.storageId);
    }
    return { acked };
  },
});

/**
 * Reaps undelivered rows at the 30-day cap and the rows the pull hid. Batches
 * keep one sweep inside a single mutation's write budget; the daily cron runs
 * again until the index range is empty.
 */
export const purgeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("relayQueue")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", now))
      .take(PURGE_BATCH);
    let purged = 0;
    for (const batch of chunkForPurge(expired)) {
      for (const row of batch) {
        await ctx.db.delete(row._id);
        purged += 1;
        if (row.storageId) await releaseAttachment(ctx, row.storageId);
      }
    }
    // A full batch means the range is not empty yet, so queue the next sweep
    // instead of waiting a day and letting content outlive the 30-day cap.
    if (expired.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.relay.purgeExpired, {});
    }
    return { purged };
  },
});
