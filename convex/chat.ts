import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireUser, normalizeUsername } from "./lib/identity";
import {
  addMessageRef,
  removeMessageRef,
  shouldDeleteBlob,
} from "./lib/retention";
import {
  deleteMediaVariants,
  readMediaVariants,
} from "./lib/mediaVariants";
import {
  CHAT_COMPONENT_PAGE_MAX,
  messagePageMeta,
  messagePageSize,
} from "./lib/paging";

const messageArgs = {
  conversationId: v.string(),
  clientMessageId: v.string(),
  text: v.string(),
  replyToMessageId: v.optional(v.string()),
};

async function meta(ctx: Parameters<typeof requireUser>[0], conversationId: string) {
  return await ctx.db
    .query("conversationMeta")
    .withIndex("by_conversationId", (q) => q.eq("conversationId", conversationId))
    .unique();
}

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

async function canWrite(ctx: Parameters<typeof requireUser>[0], conversationId: string) {
  const actor = await member(ctx, conversationId);
  const access = await ctx.runQuery(
    components.chat.conversations.getMemberAccess,
    {
      scopeId: actor.scopeId,
      conversationId,
      subjectId: actor.subjectId,
    },
  );
  if (access.access !== "read_write") throw new ConvexError("READ_ONLY");
  const preference = await ctx.db
    .query("conversationPreferences")
    .withIndex("by_user_conversation", (q) =>
      q.eq("userId", actor.userId).eq("conversationId", conversationId),
    )
    .unique();
  if (preference?.blocked) throw new ConvexError("CONVERSATION_BLOCKED");

  // A block is enforced for both sides of a direct conversation: the blocked
  // person cannot keep writing even though only the blocker has the preference.
  const conversation = await meta(ctx, conversationId);
  if (conversation?.kind === "direct") {
    for (const peerId of conversation.memberSubjectIds) {
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
        throw new ConvexError("BLOCKED_BY_PEER");
      }
    }
  }
  return actor;
}

async function profile(ctx: Parameters<typeof requireUser>[0], userId: string) {
  const typedId = userId as Id<"users">;
  const user = await ctx.db.get(typedId);
  if (!user) return null;
  const row = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", typedId))
    .unique();
  return {
    userId,
    name: row?.name || user.name || "Messenger user",
    username: row?.username || user.username || user.email || userId,
    bio: row?.bio || "",
    avatar: row?.avatarStorageId
      ? await ctx.storage.getUrl(row.avatarStorageId)
      : user.image,
  };
}

function attachmentKind(mediaType: string): "image" | "video" | "audio" | "file" {
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType.startsWith("video/")) return "video";
  if (mediaType.startsWith("audio/")) return "audio";
  return "file";
}

async function messageView(
  ctx: Parameters<typeof requireUser>[0],
  message: Awaited<ReturnType<typeof readMessages>>[number],
  subjectId: string,
) {
  const textPart = message.parts.find((part) => part.type === "text");
  const attachment = message.parts.find((part) => part.type === "attachment");
  const attachmentData = attachment?.type === "attachment" ? attachment : undefined;
  const kind = attachmentData ? attachmentKind(attachmentData.mediaType) : undefined;
  const uri = attachmentData
    ? await ctx.storage.getUrl(attachmentData.storageKey as Id<"_storage">)
    : undefined;
  // Variant rows store their URL, so this adds one indexed read per image and
  // never a `getUrl` call per width.
  const variants =
    attachmentData && kind === "image"
      ? await readMediaVariants(
          ctx,
          attachmentData.storageKey as Id<"_storage">,
        )
      : [];
  const reaction = message.reactions.find((item) => item.reactedByMe) ||
    message.reactions[0];
  return {
    id: message.id,
    text: textPart?.type === "text" ? textPart.text : undefined,
    mine: message.authorSubjectId === subjectId,
    createdAt: new Date(message.createdAt).toISOString(),
    kind,
    uri: uri ?? undefined,
    variants: variants.length ? variants : undefined,
    filename: attachmentData?.filename,
    mimeType: attachmentData?.mediaType,
    width: attachmentData?.width,
    height: attachmentData?.height,
    duration: attachmentData?.durationMs
      ? attachmentData.durationMs / 1000
      : undefined,
    deleted: message.status === "redacted",
    reaction: reaction?.key,
    sequence: message.sequence,
    revision: message.revision,
    replyTo: message.reply
      ? {
          id: message.reply.messageId,
          text: message.reply.fallbackText || "Message",
          mine: message.reply.authorSubjectId === subjectId,
        }
      : undefined,
  };
}

async function readMessages(
  ctx: Parameters<typeof requireUser>[0],
  args: { conversationId: string; beforeSequence?: number; limit?: number },
) {
  const actor = await member(ctx, args.conversationId);
  return await ctx.runQuery(components.chat.messages.list, {
    scopeId: actor.scopeId,
    subjectId: actor.subjectId,
    conversationId: args.conversationId,
    beforeSequence: args.beforeSequence,
    limit: args.limit,
  });
}

/**
 * The chat component has no get-by-id query. Page backwards from the newest
 * message until the requested row is found, so forwarding still works when the
 * source is older than the 100-message window the thread screen loads.
 */
async function findSourceMessage(
  ctx: Parameters<typeof requireUser>[0],
  actor: Awaited<ReturnType<typeof requireUser>>,
  conversationId: string,
  messageId: string,
) {
  let beforeSequence: number | undefined;
  for (;;) {
    const page = await ctx.runQuery(components.chat.messages.list, {
      scopeId: actor.scopeId,
      subjectId: actor.subjectId,
      conversationId,
      beforeSequence,
      limit: 100,
    });
    const found = page.find((item) => item.id === messageId);
    if (found) return found;
    const oldest = page[0]?.sequence;
    if (!oldest || oldest <= 1 || oldest === beforeSequence) return null;
    beforeSequence = oldest;
  }
}

export const listInbox = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const summaries = await ctx.runQuery(components.chat.conversations.list, {
      scopeId: actor.scopeId,
      subjectId: actor.subjectId,
      limit: args.limit ?? 100,
    });
    const preferences = await ctx.db
      .query("conversationPreferences")
      .withIndex("by_user", (q) => q.eq("userId", actor.userId))
      .collect();
    const byConversation = new Map(
      preferences.map((item) => [item.conversationId, item]),
    );
    const visible = summaries.filter((summary) => {
      const preference = byConversation.get(summary.id);
      if (!preference?.hiddenAt) return true;
      return !!summary.lastMessageAt && summary.lastMessageAt > preference.hiddenAt;
    });
    return await Promise.all(
      visible.map(async (summary) => {
        const conversation = await meta(ctx, summary.id);
        const members = await Promise.all(
          summary.memberSubjectIds.map((id) => profile(ctx, id)),
        );
        const others = members.filter(
          (item): item is NonNullable<typeof item> => !!item && item.userId !== actor.subjectId,
        );
        const direct = others[0];
        const name = summary.kind === "group"
          ? summary.title || members.filter(Boolean).map((item) => item?.name).join(", ")
          : direct?.name || "Conversation";
        const avatar = summary.kind === "group"
          ? members.find((item) => item?.avatar)?.avatar
          : direct?.avatar;
        const preference = byConversation.get(summary.id);
        const cleared =
          !!preference?.clearedThrough &&
          (!summary.lastMessageAt || summary.lastMessageAt <= preference.clearedThrough);
        return {
          id: summary.id,
          name,
          avatar,
          username: direct?.username,
          bio: direct?.bio,
          preview: cleared
            ? "No messages yet"
            : summary.lastMessagePreview || "Start a conversation",
          // The device formats this timestamp in its own locale and timezone.
          lastMessageAt: cleared ? undefined : summary.lastMessageAt,
          unread: cleared ? 0 : summary.unreadCount,
          group: summary.kind === "group",
          color: summary.kind === "group" ? "#F4E4D9" : "#EBEEE4",
          memberIds: summary.memberSubjectIds,
          adminIds: conversation ? [conversation.createdBy] : undefined,
          muted: preference?.muted ?? false,
          blocked: preference?.blocked ?? false,
          mediaVisibility: preference?.mediaVisibility ?? "app",
          online: false,
          createdAt: conversation
            ? new Date(conversation.createdAt).toISOString()
            : undefined,
        };
      }),
    );
  },
});

export const listMessages = query({
  args: {
    conversationId: v.string(),
    beforeSequence: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const preference = await ctx.db
      .query("conversationPreferences")
      .withIndex("by_user_conversation", (q) =>
        q.eq("userId", actor.userId).eq("conversationId", args.conversationId),
      )
      .unique();
    // The component refuses a page above 100, so a larger request is served as
    // 100 rows and the metadata below uses the size actually fetched.
    const limit = Math.min(
      messagePageSize(args.limit),
      CHAT_COMPONENT_PAGE_MAX,
    );
    const rawPage = await readMessages(ctx, {
      conversationId: args.conversationId,
      beforeSequence: args.beforeSequence,
      limit,
    });
    // The cursor describes the raw page, before the per-user filter: a page
    // hidden entirely by delete-for-me rows or a clear still reports whether
    // older history exists instead of looking like the start of the thread.
    const page = messagePageMeta({
      rawCount: rawPage.length,
      limit,
      oldestSequence: rawPage[0]?.sequence,
      beforeSequence: args.beforeSequence,
    });
    const hidden = await ctx.db
      .query("messageDeletes")
      .withIndex("by_user_conversation", (q) =>
        q.eq("userId", actor.userId).eq("conversationId", args.conversationId),
      )
      .collect();
    const hiddenIds = new Set(hidden.map((item) => item.messageId));
    const visible = rawPage.filter((message) => {
      if (hiddenIds.has(message.id)) return false;
      return preference?.clearedThrough
        ? message.createdAt > preference.clearedThrough
        : true;
    });
    return {
      messages: await Promise.all(
        visible.map((message) => messageView(ctx, message, actor.subjectId)),
      ),
      hasMore: page.hasMore,
      nextBeforeSequence: page.nextBeforeSequence,
    };
  },
});

export const createDirect = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const username = normalizeUsername(args.username);
    const target = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!target) throw new ConvexError("USERNAME_NOT_FOUND");
    if (target.userId === actor.userId) throw new ConvexError("CANNOT_CHAT_WITH_SELF");
    const members = [actor.subjectId, target.userId.toString()].sort();
    const result = await ctx.runMutation(components.chat.conversations.create, {
      scopeId: actor.scopeId,
      createdBySubjectId: actor.subjectId,
      kind: "direct",
      externalKey: `direct:${members.join(":")}`,
      memberSubjectIds: members,
    });
    const existing = await meta(ctx, result.id);
    if (!existing) {
      await ctx.db.insert("conversationMeta", {
        conversationId: result.id,
        kind: "direct",
        memberSubjectIds: members,
        createdBy: actor.subjectId,
        createdAt: Date.now(),
      });
    }
    const preference = await ctx.db
      .query("conversationPreferences")
      .withIndex("by_user_conversation", (q) =>
        q.eq("userId", actor.userId).eq("conversationId", result.id),
      )
      .unique();
    if (preference?.hiddenAt) {
      await ctx.db.patch(preference._id, { hiddenAt: undefined });
    }
    return { id: result.id, target: await profile(ctx, target.userId.toString()) };
  },
});

export const createGroup = mutation({
  args: { title: v.string(), usernames: v.array(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const usernames = [...new Set(args.usernames.map(normalizeUsername))].filter(Boolean);
    const targets = await Promise.all(
      usernames.map((username) =>
        ctx.db
          .query("profiles")
          .withIndex("by_username", (q) => q.eq("username", username))
          .unique(),
      ),
    );
    const missing = targets.some((target) => !target);
    if (missing) throw new ConvexError("USERNAME_NOT_FOUND");
    const members = [
      actor.subjectId,
      ...targets
        .filter((target): target is NonNullable<typeof target> => !!target)
        .map((target) => target.userId.toString()),
    ];
    if (new Set(members).size < 2) throw new ConvexError("GROUP_NEEDS_MEMBERS");
    const result = await ctx.runMutation(components.chat.conversations.create, {
      scopeId: actor.scopeId,
      createdBySubjectId: actor.subjectId,
      kind: "group",
      title: args.title.trim() || "New group",
      memberSubjectIds: [...new Set(members)],
    });
    await ctx.db.insert("conversationMeta", {
      conversationId: result.id,
      kind: "group",
      title: args.title.trim() || "New group",
      memberSubjectIds: [...new Set(members)],
      createdBy: actor.subjectId,
      createdAt: Date.now(),
    });
    return { id: result.id };
  },
});

export const sendText = mutation({
  args: messageArgs,
  handler: async (ctx, args) => {
    const actor = await canWrite(ctx, args.conversationId);
    const message = await ctx.runMutation(components.chat.messages.sendText, {
      scopeId: actor.scopeId,
      subjectId: actor.subjectId,
      ...args,
    });
    return await messageView(ctx, message, actor.subjectId);
  },
});

export const sendAttachment = mutation({
  args: {
    conversationId: v.string(),
    clientMessageId: v.string(),
    caption: v.optional(v.string()),
    replyToMessageId: v.optional(v.string()),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const actor = await canWrite(ctx, args.conversationId);
    const file = await ctx.db
      .query("files")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (!file || file.ownerId !== actor.userId) throw new ConvexError("FILE_FORBIDDEN");
    const message = await ctx.runMutation(components.chat.messages.sendAttachment, {
      scopeId: actor.scopeId,
      subjectId: actor.subjectId,
      conversationId: args.conversationId,
      clientMessageId: args.clientMessageId,
      caption: args.caption,
      replyToMessageId: args.replyToMessageId,
      attachment: {
        storageProvider: "convex",
        storageKey: args.storageId,
        mediaType: file.mimeType,
        filename: file.filename,
        size: file.size,
        width: file.width,
        height: file.height,
        durationMs: file.durationMs,
        fallbackText: file.filename,
      },
    });
    // The blob now belongs to this message; another send of the same upload
    // adds its own id instead of replacing this one.
    const refs = addMessageRef(file.messageRefs, message.id);
    if (refs !== undefined) await ctx.db.patch(file._id, { messageRefs: refs });
    return await messageView(ctx, message, actor.subjectId);
  },
});

export const forwardMessage = mutation({
  args: {
    sourceConversationId: v.string(),
    targetConversationId: v.string(),
    messageId: v.string(),
    clientMessageId: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.sourceConversationId === args.targetConversationId) {
      throw new ConvexError("SAME_CONVERSATION");
    }
    const sourceActor = await member(ctx, args.sourceConversationId);
    const actor = await canWrite(ctx, args.targetConversationId);
    // Forwarding must honour the same per-user hidden and cleared history as
    // the thread query, otherwise an id from a deleted message could be reused.
    const hidden = await ctx.db
      .query("messageDeletes")
      .withIndex("by_user_conversation_message", (q) =>
        q
          .eq("userId", actor.userId)
          .eq("conversationId", args.sourceConversationId)
          .eq("messageId", args.messageId),
      )
      .unique();
    const sourcePreference = await ctx.db
      .query("conversationPreferences")
      .withIndex("by_user_conversation", (q) =>
        q
          .eq("userId", actor.userId)
          .eq("conversationId", args.sourceConversationId),
      )
      .unique();
    const message = await findSourceMessage(
      ctx,
      sourceActor,
      args.sourceConversationId,
      args.messageId,
    );
    if (
      hidden ||
      !message ||
      message.status === "redacted" ||
      (sourcePreference?.clearedThrough &&
        message.createdAt <= sourcePreference.clearedThrough)
    ) {
      throw new ConvexError("MESSAGE_NOT_FOUND");
    }
    const text = message.parts.find((part) => part.type === "text");
    const attachment = message.parts.find((part) => part.type === "attachment");
    if (attachment?.type === "attachment") {
      const forwarded = await ctx.runMutation(
        components.chat.messages.sendAttachment,
        {
          scopeId: actor.scopeId,
          subjectId: actor.subjectId,
          conversationId: args.targetConversationId,
          clientMessageId: args.clientMessageId,
          caption: text?.type === "text" ? text.text : undefined,
          attachment: {
            storageProvider: attachment.storageProvider,
            storageKey: attachment.storageKey,
            mediaType: attachment.mediaType,
            filename: attachment.filename,
            size: attachment.size,
            width: attachment.width,
            height: attachment.height,
            durationMs: attachment.durationMs,
            fallbackText: attachment.fallbackText,
          },
        },
      );
      // The forwarded message points at the same blob. Record it before the
      // original can be deleted for everyone, or the bytes would go early.
      const shared = await ctx.db
        .query("files")
        .withIndex("by_storageId", (q) =>
          q.eq("storageId", attachment.storageKey as Id<"_storage">),
        )
        .unique();
      if (shared) {
        const refs = addMessageRef(shared.messageRefs, forwarded.id);
        if (refs !== undefined) {
          await ctx.db.patch(shared._id, { messageRefs: refs });
        }
      }
      return await messageView(ctx, forwarded, actor.subjectId);
    }
    if (text?.type !== "text" || !text.text.trim()) {
      throw new ConvexError("MESSAGE_NOT_FOUND");
    }
    const forwarded = await ctx.runMutation(
      components.chat.messages.sendText,
      {
        scopeId: actor.scopeId,
        subjectId: actor.subjectId,
        conversationId: args.targetConversationId,
        clientMessageId: args.clientMessageId,
        text: text.text,
      },
    );
    return await messageView(ctx, forwarded, actor.subjectId);
  },
});

export const markReadThrough = mutation({
  args: { conversationId: v.string(), sequence: v.number() },
  handler: async (ctx, args) => {
    const actor = await member(ctx, args.conversationId);
    return await ctx.runMutation(components.chat.messages.markReadThrough, {
      scopeId: actor.scopeId,
      subjectId: actor.subjectId,
      conversationId: args.conversationId,
      sequence: args.sequence,
    });
  },
});

export const setReaction = mutation({
  args: {
    conversationId: v.string(),
    messageId: v.string(),
    reactionKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await canWrite(ctx, args.conversationId);
    return await ctx.runMutation(components.chat.messages.setReaction, {
      scopeId: actor.scopeId,
      subjectId: actor.subjectId,
      messageId: args.messageId,
      reactionKey: args.reactionKey,
    });
  },
});

export const deleteOwnMessage = mutation({
  args: {
    conversationId: v.string(),
    messageId: v.string(),
    expectedRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await member(ctx, args.conversationId);
    const result = await ctx.runMutation(components.chat.messages.deleteOwnMessage, {
      scopeId: actor.scopeId,
      subjectId: actor.subjectId,
      messageId: args.messageId,
      expectedRevision: args.expectedRevision,
    });
    // Delete-for-everyone is the only delete that may reclaim a blob. A blob can
    // still be shared by a forward or a second send of the same upload, so drop
    // this message id and keep the bytes while any reference remains.
    for (const key of new Set(result.attachmentStorageKeys)) {
      const row = await ctx.db
        .query("files")
        .withIndex("by_storageId", (q) =>
          q.eq("storageId", key as Id<"_storage">),
        )
        .unique();
      // A missing row, or a legacy row whose refs are unknown, is not proof the
      // blob is unused.
      if (!row || row.messageRefs === undefined) continue;
      const next = removeMessageRef(row.messageRefs, result.message.id);
      if (shouldDeleteBlob(next)) {
        await deleteMediaVariants(ctx, row.storageId);
        await ctx.db.delete(row._id);
        await ctx.storage.delete(row.storageId);
      } else {
        await ctx.db.patch(row._id, { messageRefs: next });
      }
    }
    return await messageView(ctx, result.message, actor.subjectId);
  },
});

export const deleteForMe = mutation({
  args: { conversationId: v.string(), messageId: v.string() },
  handler: async (ctx, args) => {
    // This only hides one message for one user. "Clear chat" and "delete chat"
    // work the same way, through `clearedThrough`/`hiddenAt` preferences, so
    // none of them may delete a shared blob: the other members of the
    // conversation still reference the same messages and would lose their media.
    const actor = await member(ctx, args.conversationId);
    const existing = await ctx.db
      .query("messageDeletes")
      .withIndex("by_user_conversation_message", (q) =>
        q
          .eq("userId", actor.userId)
          .eq("conversationId", args.conversationId)
          .eq("messageId", args.messageId),
      )
      .unique();
    if (existing) return true;
    await ctx.db.insert("messageDeletes", {
      userId: actor.userId,
      conversationId: args.conversationId,
      messageId: args.messageId,
      deletedAt: Date.now(),
    });
    return true;
  },
});

export const heartbeatOnline = mutation({
  args: { sessionId: v.string(), interval: v.number() },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    return await ctx.runMutation(components.chat.presence.heartbeatOnline, {
      scopeId: actor.scopeId,
      subjectId: actor.subjectId,
      ...args,
    });
  },
});

export const listOnline = query({
  args: { conversationId: v.string() },
  handler: async (ctx, args) => {
    const actor = await member(ctx, args.conversationId);
    return await ctx.runQuery(components.chat.presence.listOnline, {
      scopeId: actor.scopeId,
      subjectId: actor.subjectId,
      conversationId: args.conversationId,
    });
  },
});

export const heartbeatPresence = mutation({
  args: { conversationId: v.string(), sessionId: v.string(), interval: v.number() },
  handler: async (ctx, args) => {
    const actor = await member(ctx, args.conversationId);
    return await ctx.runMutation(components.chat.presence.heartbeat, {
      scopeId: actor.scopeId,
      subjectId: actor.subjectId,
      ...args,
    });
  },
});

export const listPresence = query({
  args: { conversationId: v.string(), roomToken: v.string() },
  handler: async (ctx, args) => {
    const actor = await member(ctx, args.conversationId);
    return await ctx.runQuery(components.chat.presence.list, {
      scopeId: actor.scopeId,
      subjectId: actor.subjectId,
      ...args,
    });
  },
});

export const setTyping = mutation({
  args: { conversationId: v.string(), typing: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await canWrite(ctx, args.conversationId);
    return await ctx.runMutation(components.chat.presence.setTyping, {
      scopeId: actor.scopeId,
      subjectId: actor.subjectId,
      ...args,
    });
  },
});
