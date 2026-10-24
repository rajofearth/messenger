import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/identity";

const event = v.object({
  event: v.string(),
  occurredAt: v.number(),
  durationMs: v.optional(v.number()),
  bytes: v.optional(v.number()),
  count: v.optional(v.number()),
  index: v.optional(v.number()),
  total: v.optional(v.number()),
  video: v.optional(v.boolean()),
  jsHeapUsedBytes: v.optional(v.number()),
  errorCode: v.optional(v.string()),
});

/** Development-build interaction timings; the client never sends media data. */
export const recordBatch = mutation({
  args: {
    sessionId: v.string(),
    events: v.array(event),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const events = args.events.slice(0, 50);
    for (const item of events) {
      await ctx.db.insert("devTelemetry", {
        userId: actor.userId,
        sessionId: args.sessionId,
        ...item,
      });
    }
    return events.length;
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const limit = Math.max(1, Math.min(args.limit ?? 200, 500));
    const rows = await ctx.db
      .query("devTelemetry")
      .withIndex("by_occurredAt")
      .order("desc")
      .collect();
    return rows.filter((row) => row.userId === actor.userId).slice(0, limit);
  },
});
