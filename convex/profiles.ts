import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { normalizeUsername, requireUser, validateUsername } from "./lib/identity";

type ProfileCtx = QueryCtx | MutationCtx;

async function passwordAccount(ctx: ProfileCtx, userId: Id<"users">) {
  return await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) =>
      q.eq("userId", userId).eq("provider", "password"),
    )
    .unique();
}

async function publicProfile(ctx: ProfileCtx, userId: Id<"users">) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  const user = await ctx.db.get(userId);
  if (!user) return null;
  const avatarUrl = profile?.avatarStorageId
    ? await ctx.storage.getUrl(profile.avatarStorageId)
    : undefined;
  return {
    userId: userId.toString(),
    name: profile?.name || user.name || "Messenger user",
    username: profile?.username || user.username || user.email || userId,
    bio: profile?.bio || "",
    avatarUrl: avatarUrl ?? undefined,
  };
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx);
    return await publicProfile(ctx, actor.userId);
  },
});

export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx);
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", actor.userId))
      .unique();
    if (existing) return existing._id;

    const account = await passwordAccount(ctx, actor.userId);
    if (!account) throw new ConvexError("AUTH_ACCOUNT_NOT_FOUND");
    // The password provider id is the canonical handle. Deriving the profile
    // from the account keeps both records identical, even for repaired data.
    const username = validateUsername(
      account.providerAccountId ||
        actor.user.username ||
        actor.user.email ||
        `user_${actor.userId}`,
    );
    const conflict = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (conflict && conflict.userId !== actor.userId) {
      throw new ConvexError("USERNAME_TAKEN");
    }
    const now = Date.now();
    const profileId = await ctx.db.insert("profiles", {
      userId: actor.userId,
      name: actor.user.name?.trim() || "Messenger user",
      username,
      bio: "",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(actor.userId, { username, email: username });
    return profileId;
  },
});

export const update = mutation({
  args: {
    name: v.string(),
    username: v.string(),
    bio: v.string(),
    avatarStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const name = args.name.trim();
    if (!name) throw new ConvexError("INVALID_NAME");
    const username = validateUsername(args.username);
    const current = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", actor.userId))
      .unique();
    if (!current) throw new ConvexError("PROFILE_NOT_READY");
    const conflict = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (conflict && conflict.userId !== actor.userId) {
      throw new ConvexError("USERNAME_TAKEN");
    }
    // The password provider owns the login id, so check it as well as the
    // public profile. Both records must move together or one would become a
    // stale handle that can be claimed or cannot sign in.
    const usernameAccount = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", username),
      )
      .unique();
    if (usernameAccount && usernameAccount.userId !== actor.userId) {
      throw new ConvexError("USERNAME_TAKEN");
    }
    const account = await passwordAccount(ctx, actor.userId);
    if (!account) throw new ConvexError("AUTH_ACCOUNT_NOT_FOUND");

    const avatarStorageId = args.avatarStorageId;
    if (avatarStorageId) {
      const avatar = await ctx.db
        .query("files")
        .withIndex("by_storageId", (q) => q.eq("storageId", avatarStorageId))
        .unique();
      if (
        !avatar ||
        avatar.ownerId !== actor.userId ||
        avatar.kind !== "avatar"
      ) {
        throw new ConvexError("FILE_FORBIDDEN");
      }
    }

    if (account.providerAccountId !== username) {
      await ctx.db.patch(account._id, { providerAccountId: username });
    }
    await ctx.db.patch(actor.userId, { name, username, email: username });
    await ctx.db.patch(current._id, {
      name,
      username,
      bio: args.bio.trim(),
      ...(args.avatarStorageId ? { avatarStorageId: args.avatarStorageId } : {}),
      updatedAt: Date.now(),
    });
    if (
      args.avatarStorageId &&
      current.avatarStorageId &&
      current.avatarStorageId !== args.avatarStorageId
    ) {
      await ctx.storage.delete(current.avatarStorageId);
    }
    return await publicProfile(ctx, actor.userId);
  },
});

export const lookup = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const username = normalizeUsername(args.username);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    return profile ? await publicProfile(ctx, profile.userId) : null;
  },
});
