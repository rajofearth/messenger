import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/identity";

async function member(ctx: Parameters<typeof requireUser>[0], conversationId: string) {
  const actor = await requireUser(ctx);
  const access = await ctx.runQuery(
    components.chat.conversations.getMemberAccess,
    {
      scopeId: actor.scopeId,
      conversationId,
      subjectId: actor.subjectId,
    },
  );
  if (access.access === "none") throw new ConvexError("CHAT_NOT_FOUND");
  return actor;
}

export const get = query({
  args: { conversationId: v.string() },
  handler: async (ctx, args) => {
    const actor = await member(ctx, args.conversationId);
    const row = await ctx.db
      .query("conversationPreferences")
      .withIndex("by_user_conversation", (q) =>
        q.eq("userId", actor.userId).eq("conversationId", args.conversationId),
      )
      .unique();
    return row
      ? {
          muted: row.muted,
          blocked: row.blocked,
          mediaVisibility: row.mediaVisibility,
          clearedThrough: row.clearedThrough,
          hiddenAt: row.hiddenAt,
        }
      : {
          muted: false,
          blocked: false,
          mediaVisibility: "app" as const,
          clearedThrough: undefined,
          hiddenAt: undefined,
        };
  },
});

export const set = mutation({
  args: {
    conversationId: v.string(),
    muted: v.optional(v.boolean()),
    blocked: v.optional(v.boolean()),
    mediaVisibility: v.optional(v.union(v.literal("app"), v.literal("gallery"))),
  },
  handler: async (ctx, args) => {
    const actor = await member(ctx, args.conversationId);
    const existing = await ctx.db
      .query("conversationPreferences")
      .withIndex("by_user_conversation", (q) =>
        q.eq("userId", actor.userId).eq("conversationId", args.conversationId),
      )
      .unique();
    const current = existing ?? {
      muted: false,
      blocked: false,
      mediaVisibility: "app" as const,
    };
    const next = {
      muted: args.muted ?? current.muted,
      blocked: args.blocked ?? current.blocked,
      mediaVisibility: args.mediaVisibility ?? current.mediaVisibility,
    };
    if (existing) await ctx.db.patch(existing._id, { ...next, updatedAt: Date.now() });
    else
      await ctx.db.insert("conversationPreferences", {
        userId: actor.userId,
        conversationId: args.conversationId,
        ...next,
        updatedAt: Date.now(),
      });
    return next;
  },
});

export const all = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx);
    const rows = await ctx.db
      .query("conversationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", actor.userId))
      .collect();
    return rows.map((row) => ({
      conversationId: row.conversationId,
      muted: row.muted,
      blocked: row.blocked,
      mediaVisibility: row.mediaVisibility,
      clearedThrough: row.clearedThrough,
      hiddenAt: row.hiddenAt,
    }));
  },
});

/** Clears this user's copy of the history; the other side keeps its messages. */
export const clear = mutation({
  args: { conversationId: v.string(), through: v.number() },
  handler: async (ctx, args) => {
    const actor = await member(ctx, args.conversationId);
    const existing = await ctx.db
      .query("conversationPreferences")
      .withIndex("by_user_conversation", (q) =>
        q.eq("userId", actor.userId).eq("conversationId", args.conversationId),
      )
      .unique();
    const clearedThrough = Math.max(
      existing?.clearedThrough ?? 0,
      Math.min(Date.now(), args.through),
    );
    if (existing) {
      await ctx.db.patch(existing._id, {
        clearedThrough,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("conversationPreferences", {
        userId: actor.userId,
        conversationId: args.conversationId,
        muted: false,
        blocked: false,
        mediaVisibility: "app",
        clearedThrough,
        updatedAt: Date.now(),
      });
    }
    return clearedThrough;
  },
});

/** Hides the conversation until a newer message arrives. */
export const hide = mutation({
  args: { conversationId: v.string(), hiddenAt: v.number() },
  handler: async (ctx, args) => {
    const actor = await member(ctx, args.conversationId);
    const existing = await ctx.db
      .query("conversationPreferences")
      .withIndex("by_user_conversation", (q) =>
        q.eq("userId", actor.userId).eq("conversationId", args.conversationId),
      )
      .unique();
    const hiddenAt = Math.max(existing?.hiddenAt ?? 0, args.hiddenAt);
    if (existing) {
      await ctx.db.patch(existing._id, { hiddenAt, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("conversationPreferences", {
        userId: actor.userId,
        conversationId: args.conversationId,
        muted: false,
        blocked: false,
        mediaVisibility: "app",
        hiddenAt,
        updatedAt: Date.now(),
      });
    }
    return hiddenAt;
  },
});

/** Restores a hidden conversation when the user opens or writes to it again. */
export const restore = mutation({
  args: { conversationId: v.string() },
  handler: async (ctx, args) => {
    const actor = await member(ctx, args.conversationId);
    const existing = await ctx.db
      .query("conversationPreferences")
      .withIndex("by_user_conversation", (q) =>
        q.eq("userId", actor.userId).eq("conversationId", args.conversationId),
      )
      .unique();
    if (existing?.hiddenAt) {
      await ctx.db.patch(existing._id, {
        hiddenAt: undefined,
        updatedAt: Date.now(),
      });
    }
    return true;
  },
});
