import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query, internalMutation } from "./_generated/server";
import { requireUser } from "./lib/identity";

/**
 * A story is visible to its owner and to anyone who shares a conversation with
 * the owner. Conversations are mirrored in `conversationMeta`, which is small
 * enough to scan and keeps the rule in one place.
 */
async function storyAudience(
  ctx: QueryCtx | MutationCtx,
  actor: { subjectId: string },
) {
  const conversations = await ctx.db.query("conversationMeta").collect();
  const allowed = new Set<string>([actor.subjectId]);
  for (const conversation of conversations) {
    if (!conversation.memberSubjectIds.includes(actor.subjectId)) continue;
    for (const memberId of conversation.memberSubjectIds) allowed.add(memberId);
  }
  return allowed;
}

const story = (ctx: QueryCtx | MutationCtx, row: {
  _id: Id<"stories">;
  ownerId: Id<"users">;
  storageId: Id<"_storage">;
  mimeType: string;
  caption: string;
  crop?: "fit" | "fill";
  createdAt: number;
  expiresAt: number;
}, seen: boolean, name: string, avatar: string | undefined) =>
  ctx.storage.getUrl(row.storageId).then((url) => ({
    id: row._id,
    ownerId: row.ownerId,
    name,
    avatar,
    image: url,
    video: row.mimeType.startsWith("video/"),
    caption: row.caption,
    crop: row.crop,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    seen,
  }));

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const now = Date.now();
    const limit = Math.max(1, Math.min(args.limit ?? 50, 100));
    const audience = await storyAudience(ctx, actor);
    const rows = await ctx.db
      .query("stories")
      .withIndex("by_expiresAt", (q) => q.gt("expiresAt", now))
      .collect();
    // Filter before applying the display limit so a hidden owner's story cannot
    // crowd an allowed story out of the newest page.
    const visible = rows
      .filter((row) => audience.has(row.ownerId.toString()))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
    const result = await Promise.all(
      visible.map(async (row) => {
        const user = await ctx.db.get(row.ownerId);
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", row.ownerId))
          .unique();
        const view = await ctx.db
          .query("storyViews")
          .withIndex("by_story_user", (q) =>
            q.eq("storyId", row._id).eq("userId", actor.userId),
          )
          .unique();
        return await story(
          ctx,
          row,
          !!view,
          profile?.name || user?.name || "Messenger user",
          (profile?.avatarStorageId
            ? await ctx.storage.getUrl(profile.avatarStorageId)
            : user?.image) ?? undefined,
        );
      }),
    );
    return result.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const create = mutation({
  args: {
    storageId: v.id("_storage"),
    caption: v.string(),
    crop: v.optional(v.union(v.literal("fit"), v.literal("fill"))),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const file = await ctx.db
      .query("files")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (!file || file.ownerId !== actor.userId || file.kind !== "story") {
      throw new ConvexError("FILE_FORBIDDEN");
    }
    const now = Date.now();
    return await ctx.db.insert("stories", {
      ownerId: actor.userId,
      storageId: args.storageId,
      mimeType: file.mimeType,
      caption: args.caption.trim(),
      crop: args.crop,
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
    });
  },
});

/**
 * The owner-only view list for one story. Everyone else gets a forbidden error
 * rather than a count, so a viewer cannot probe another person's audience.
 */
export const views = query({
  args: { storyId: v.id("stories") },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const row = await ctx.db.get(args.storyId);
    // A cached story can outlive its server row by a moment. Treat that as an
    // empty audience instead of failing the viewer overlay; other accounts
    // still get a forbidden error.
    if (!row) return [];
    if (row.ownerId !== actor.userId) {
      throw new ConvexError("STORY_FORBIDDEN");
    }
    if (row.expiresAt <= Date.now()) return [];
    const seen = await ctx.db
      .query("storyViews")
      .withIndex("by_story_user", (q) => q.eq("storyId", args.storyId))
      .take(200);
    const viewers = await Promise.all(
      seen
        .filter((view) => view.userId !== actor.userId)
        .map(async (view) => {
          const user = await ctx.db.get(view.userId);
          const profile = await ctx.db
            .query("profiles")
            .withIndex("by_userId", (q) => q.eq("userId", view.userId))
            .unique();
          return {
            id: view.userId.toString(),
            name: profile?.name || user?.name || "Messenger user",
            avatar:
              (profile?.avatarStorageId
                ? await ctx.storage.getUrl(profile.avatarStorageId)
                : user?.image) ?? undefined,
            seenAt: view.seenAt,
          };
        }),
    );
    return viewers.sort((a, b) => b.seenAt - a.seenAt);
  },
});

export const markSeen = mutation({
  args: { storyId: v.id("stories") },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const row = await ctx.db.get(args.storyId);
    if (!row || row.expiresAt <= Date.now()) throw new ConvexError("STORY_EXPIRED");
    const audience = await storyAudience(ctx, actor);
    if (!audience.has(row.ownerId.toString())) {
      throw new ConvexError("STORY_NOT_FOUND");
    }
    const existing = await ctx.db
      .query("storyViews")
      .withIndex("by_story_user", (q) =>
        q.eq("storyId", args.storyId).eq("userId", actor.userId),
      )
      .unique();
    if (existing) await ctx.db.patch(existing._id, { seenAt: Date.now() });
    else
      await ctx.db.insert("storyViews", {
        storyId: args.storyId,
        userId: actor.userId,
        seenAt: Date.now(),
      });
    return true;
  },
});

export const remove = mutation({
  args: { storyId: v.id("stories") },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const row = await ctx.db.get(args.storyId);
    if (!row || row.ownerId !== actor.userId) throw new ConvexError("STORY_FORBIDDEN");
    await ctx.db.delete(args.storyId);
    await ctx.storage.delete(row.storageId);
    return true;
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("stories")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now()))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
      await ctx.storage.delete(row.storageId);
      const views = await ctx.db
        .query("storyViews")
        .withIndex("by_story_user", (q) => q.eq("storyId", row._id))
        .collect();
      for (const view of views) await ctx.db.delete(view._id);
    }
    return rows.length;
  },
});
