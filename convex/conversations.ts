import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { directKey, groupTitle, uniqueMembers } from "./lib/conversations";
import { normalizeUsername, requireUser } from "./lib/identity";

type ConversationCtx = QueryCtx | MutationCtx;

/** The fields a view needs, so a fresh insert is projected without a re-read. */
type ConversationRecord = Pick<
  Doc<"conversations">,
  "_id" | "kind" | "title" | "createdAt"
>;

/** The shape every conversation read and write answers with. */
type ConversationView = {
  id: string;
  kind: "direct" | "group";
  title: string;
  createdAt: number;
  memberIds: string[];
  adminIds: string[];
  members: Array<{
    id: string;
    name: string;
    username?: string;
    avatar?: string;
    bio?: string;
  }>;
};

async function memberRows(
  ctx: ConversationCtx,
  conversationId: Id<"conversations">,
): Promise<Doc<"conversationMembers">[]> {
  return await ctx.db
    .query("conversationMembers")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .collect();
}

/**
 * The public projection of one member. The profile row owns the current name
 * and avatar; the users row covers an account whose `profiles.ensure` has not
 * finished yet.
 */
async function memberView(ctx: ConversationCtx, subjectId: string) {
  const userId = subjectId as Id<"users">;
  const user = await ctx.db.get(userId);
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  const avatar = profile?.avatarStorageId
    ? await ctx.storage.getUrl(profile.avatarStorageId)
    : undefined;
  return {
    id: subjectId,
    name: profile?.name || user?.name || "Messenger user",
    username: profile?.username || user?.username || user?.email || undefined,
    avatar: avatar ?? undefined,
    bio: profile?.bio || "",
  };
}

async function viewOf(
  ctx: ConversationCtx,
  conversation: ConversationRecord,
  rows: readonly Doc<"conversationMembers">[],
): Promise<ConversationView> {
  const memberIds = rows.map((row) => row.subjectId);
  return {
    id: conversation._id.toString(),
    kind: conversation.kind,
    title: conversation.title,
    createdAt: conversation.createdAt,
    memberIds,
    adminIds: rows
      .filter((row) => row.role === "owner")
      .map((row) => row.subjectId),
    members: await Promise.all(
      memberIds.map((subjectId) => memberView(ctx, subjectId)),
    ),
  };
}

async function loadView(
  ctx: ConversationCtx,
  conversation: ConversationRecord,
): Promise<ConversationView> {
  return await viewOf(
    ctx,
    conversation,
    await memberRows(ctx, conversation._id),
  );
}

/**
 * The inbox. Mute, block, clear and hide are per-user preferences the client
 * applies from `preferences.all`; this query only answers membership, oldest
 * conversation first.
 */
export const list = query({
  args: {},
  handler: async (ctx): Promise<ConversationView[]> => {
    const actor = await requireUser(ctx);
    const mine = await ctx.db
      .query("conversationMembers")
      .withIndex("by_subject", (q) => q.eq("subjectId", actor.subjectId))
      .collect();
    const conversations: Doc<"conversations">[] = [];
    for (const row of mine) {
      const conversation = await ctx.db.get(row.conversationId);
      if (conversation) conversations.push(conversation);
    }
    conversations.sort((a, b) => a.createdAt - b.createdAt);
    return await Promise.all(
      conversations.map((conversation) => loadView(ctx, conversation)),
    );
  },
});

/**
 * Opens the direct conversation with one username, or creates it. A second
 * call for the same pair reuses the row through `externalKey`, so neither side
 * can end up with a separate thread for the same person.
 */
export const createDirect = mutation({
  args: { username: v.string() },
  handler: async (ctx, args): Promise<ConversationView> => {
    const actor = await requireUser(ctx);
    const username = normalizeUsername(args.username);
    const target = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!target) throw new ConvexError({ code: "USERNAME_NOT_FOUND" });
    if (target.userId === actor.userId) {
      throw new ConvexError({ code: "CANNOT_CHAT_WITH_SELF" });
    }
    const externalKey = directKey(actor.subjectId, target.userId.toString());
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_externalKey", (q) => q.eq("externalKey", externalKey))
      .unique();
    if (existing) return await loadView(ctx, existing);

    const createdAt = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      kind: "direct",
      title: "",
      externalKey,
      createdBy: actor.subjectId,
      createdAt,
    });
    await ctx.db.insert("conversationMembers", {
      conversationId,
      subjectId: actor.subjectId,
      role: "owner",
    });
    await ctx.db.insert("conversationMembers", {
      conversationId,
      subjectId: target.userId.toString(),
      role: "member",
    });
    return await loadView(ctx, {
      _id: conversationId,
      kind: "direct",
      title: "",
      createdAt,
    });
  },
});

/**
 * Creates a group. Membership is the caller plus every resolved username, and
 * a group that would only contain the caller is refused.
 */
export const createGroup = mutation({
  args: { title: v.string(), usernames: v.array(v.string()) },
  handler: async (ctx, args): Promise<ConversationView> => {
    const actor = await requireUser(ctx);
    const usernames = [
      ...new Set(args.usernames.map(normalizeUsername).filter(Boolean)),
    ];
    const targets = await Promise.all(
      usernames.map((username) =>
        ctx.db
          .query("profiles")
          .withIndex("by_username", (q) => q.eq("username", username))
          .unique(),
      ),
    );
    if (targets.some((target) => !target)) {
      throw new ConvexError({ code: "USERNAME_NOT_FOUND" });
    }
    const memberIds = uniqueMembers([
      actor.subjectId,
      ...targets
        .filter((target): target is NonNullable<typeof target> => !!target)
        .map((target) => target.userId.toString()),
    ]);
    if (memberIds.length < 2) {
      throw new ConvexError({ code: "GROUP_NEEDS_MEMBERS" });
    }
    const title = groupTitle(args.title);
    const createdAt = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      kind: "group",
      title,
      createdBy: actor.subjectId,
      createdAt,
    });
    for (const [index, subjectId] of memberIds.entries()) {
      await ctx.db.insert("conversationMembers", {
        conversationId,
        subjectId,
        role: index === 0 ? "owner" : "member",
      });
    }
    return await loadView(ctx, {
      _id: conversationId,
      kind: "group",
      title,
      createdAt,
    });
  },
});
