import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUser } from "./lib/identity";

const SIGNAL_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_PAYLOAD_BYTES = 64 * 1024;

type CallCtx = QueryCtx | MutationCtx;

async function directMembers(ctx: CallCtx, conversationId: string) {
  const id = conversationId as Id<"conversations">;
  const conversation = await ctx.db.get(id);
  if (!conversation || conversation.kind !== "direct") {
    throw new ConvexError("CALL_DIRECT_ONLY");
  }
  return await ctx.db
    .query("conversationMembers")
    .withIndex("by_conversation", (q) => q.eq("conversationId", id))
    .collect();
}

function memberIds(rows: readonly Doc<"conversationMembers">[]) {
  return new Set(rows.map((row) => row.subjectId));
}

export const sendSignal = mutation({
  args: {
    callId: v.string(),
    conversationId: v.string(),
    toUserId: v.id("users"),
    kind: v.union(
      v.literal("invite"),
      v.literal("offer"),
      v.literal("answer"),
      v.literal("ice"),
      v.literal("end"),
    ),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const rows = await directMembers(ctx, args.conversationId);
    const members = memberIds(rows);
    if (!members.has(actor.subjectId) || !members.has(args.toUserId.toString())) {
      throw new ConvexError("CALL_NOT_MEMBER");
    }
    if (args.toUserId === actor.userId) throw new ConvexError("CALL_SELF");
    if (new TextEncoder().encode(args.payload).byteLength > MAX_PAYLOAD_BYTES) {
      throw new ConvexError("CALL_SIGNAL_TOO_LARGE");
    }
    const now = Date.now();
    await ctx.db.insert("callSignals", {
      ...args,
      fromUserId: actor.userId,
      createdAt: now,
      expiresAt: now + SIGNAL_TTL_MS,
    });
    if (args.kind === "invite") {
      // The payload remains opaque. The recipient fetches the signal and builds
      // the native incoming-call notification locally.
      await ctx.scheduler.runAfter(0, internal.push.wakeUser, {
        userId: args.toUserId,
        queueId: `call:${args.callId}`,
      });
    }
  },
});

export const forCall = query({
  args: { callId: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const rows = await ctx.db
      .query("callSignals")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();
    const live = rows.filter(
      (row) =>
        row.expiresAt > Date.now() &&
        row.toUserId === actor.userId,
    );
    return live.map((row) => ({
      id: row._id,
      kind: row.kind,
      payload: row.payload,
      fromUserId: row.fromUserId.toString(),
      createdAt: row.createdAt,
    }));
  },
});

/** Returns only unexpired invitations addressed to the signed-in user. */
export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx);
    const rows = await ctx.db
      .query("callSignals")
      .withIndex("by_recipient", (q) => q.eq("toUserId", actor.userId))
      .order("desc")
      .take(20);
    return rows
      .filter((row) => row.kind === "invite" && row.expiresAt > Date.now())
      .map((row) => ({
        id: row._id,
        callId: row.callId,
        conversationId: row.conversationId,
        fromUserId: row.fromUserId.toString(),
        payload: row.payload,
        createdAt: row.createdAt,
      }));
  },
});

export const purgeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("callSignals")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", Date.now()))
      .take(200);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
