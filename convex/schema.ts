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
    /** FCM registration token for this device; absent until it registers one. */
    pushToken: v.optional(v.string()),
    /** Push platform reported by the client, currently always `android`. */
    pushPlatform: v.optional(v.string()),
    /** When the token was last registered or refreshed. */
    pushUpdatedAt: v.optional(v.number()),
    /** Set when the token is cleared; a device with this set is never woken. */
    pushRevokedAt: v.optional(v.number()),
  })    .index("by_user", ["userId"])
    .index("by_session", ["authSessionId"])
    .index("by_user_device", ["userId", "deviceId"])
    .index("by_pushToken", ["pushToken"]),
  conversationMeta: defineTable({
    conversationId: v.string(),
    kind: v.union(v.literal("direct"), v.literal("group")),
    title: v.optional(v.string()),
    memberSubjectIds: v.array(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    /**
     * The last sequence handed out for this conversation. Seeded once from the
     * chat component so relay messages continue the history that already exists.
     */
    nextSequence: v.optional(v.number()),
  }).index("by_conversationId", ["conversationId"]),
  /**
   * One row per recipient per relayed item. The envelope is the whole message;
   * the row is deleted when the recipient's phone acknowledges its local
   * commit, or at `expiresAt`, whichever comes first.
   */
  relayQueue: defineTable({
    recipientUserId: v.id("users"),
    senderUserId: v.id("users"),
    conversationId: v.string(),
    queueId: v.string(),
    /** Client message id for a message, empty for an op. Deduplicates retries. */
    messageId: v.string(),
    op: v.union(v.literal("message"), v.literal("reaction"), v.literal("delete")),
    sequence: v.number(),
    envelope: v.string(),
    bytes: v.number(),
    storageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_recipient", ["recipientUserId", "createdAt"])
    .index("by_expiresAt", ["expiresAt"])
    .index("by_storageId", ["storageId"])
    .index("by_conversation_message", ["conversationId", "messageId"]),
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
    /**
     * Message ids that currently reference this blob. Undefined means a
     * pre-migration row, so deletion leaves the blob alone.
     */
    messageRefs: v.optional(v.array(v.string())),
    /**
     * Image uploads record whether responsive widths exist. `pending` and
     * `failed` are reserved for a server-side generator; finalize currently
     * writes `ready` or `skipped`.
     */
    variantsState: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("ready"),
        v.literal("skipped"),
        v.literal("failed"),
      ),
    ),
    createdAt: v.number(),
  })
    .index("by_storageId", ["storageId"])
    .index("by_owner", ["ownerId"]),
  /**
   * One stored width of an image upload. The URL is resolved once when the row
   * is written, so a thread projection never calls `getUrl` per variant.
   */
  mediaVariants: defineTable({
    sourceStorageId: v.id("_storage"),
    variantStorageId: v.id("_storage"),
    name: v.string(),
    width: v.number(),
    height: v.number(),
    bytes: v.number(),
    mimeType: v.string(),
    url: v.string(),
    createdAt: v.number(),
  })
    .index("by_source", ["sourceStorageId"])
    .index("by_variant_storage", ["variantStorageId"]),
  stories: defineTable({
    ownerId: v.id("users"),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    caption: v.string(),
    crop: v.optional(v.union(v.literal("fit"), v.literal("fill"))),
    /** Source dimensions, copied from the finalized story upload. */
    width: v.optional(v.number()),
    height: v.optional(v.number()),
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
