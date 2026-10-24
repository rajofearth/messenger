import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * One row per published APK. The feed only reads the highest version code,
 * but keeping history makes a bad publish visible and lets the publish
 * mutation reject a release that would move the feed backwards.
 */
export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    username: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("username", ["username"]),
  releases: defineTable({
    versionCode: v.number(),
    versionName: v.string(),
    apkUrl: v.string(),
    apkSha256: v.string(),
    apkBytes: v.number(),
    minVersionCode: v.number(),
    mandatory: v.boolean(),
    notes: v.string(),
    publishedAt: v.number(),
  }).index("by_versionCode", ["versionCode"]),
  profiles: defineTable({
    userId: v.id("users"),
    name: v.string(),
    username: v.string(),
    bio: v.string(),
    avatarStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_username", ["username"]),
  devices: defineTable({
    userId: v.id("users"),
    authSessionId: v.id("authSessions"),
    deviceId: v.string(),
    label: v.string(),
    platform: v.string(),
    registeredAt: v.number(),
    lastSeenAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_session", ["authSessionId"])
    .index("by_user_device", ["userId", "deviceId"]),
  conversationMeta: defineTable({
    conversationId: v.string(),
    kind: v.union(v.literal("direct"), v.literal("group")),
    title: v.optional(v.string()),
    memberSubjectIds: v.array(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
  }).index("by_conversationId", ["conversationId"]),
  conversationPreferences: defineTable({
    userId: v.id("users"),
    conversationId: v.string(),
    muted: v.boolean(),
    blocked: v.boolean(),
    mediaVisibility: v.union(v.literal("app"), v.literal("gallery")),
    /** Messages created at or before this timestamp are hidden for this user. */
    clearedThrough: v.optional(v.number()),
    /** The conversation is hidden from this user's inbox until a newer message. */
    hiddenAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user_conversation", ["userId", "conversationId"])
    .index("by_user", ["userId"]),
  messageDeletes: defineTable({
    userId: v.id("users"),
    conversationId: v.string(),
    messageId: v.string(),
    deletedAt: v.number(),
  })
    .index("by_user_conversation", ["userId", "conversationId"])
    .index("by_user_conversation_message", [
      "userId",
      "conversationId",
      "messageId",
    ]),
  files: defineTable({
    ownerId: v.id("users"),
    storageId: v.id("_storage"),
    kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio"), v.literal("file"), v.literal("avatar"), v.literal("story")),
    mimeType: v.string(),
    filename: v.string(),
    size: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_storageId", ["storageId"])
    .index("by_owner", ["ownerId"]),
  stories: defineTable({
    ownerId: v.id("users"),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    caption: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_expiresAt", ["expiresAt"]),
  storyViews: defineTable({
    storyId: v.id("stories"),
    userId: v.id("users"),
    seenAt: v.number(),
  }).index("by_story_user", ["storyId", "userId"]),
  devTelemetry: defineTable({
    userId: v.id("users"),
    sessionId: v.string(),
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
  })
    .index("by_session", ["sessionId"])
    .index("by_occurredAt", ["occurredAt"]),
});
