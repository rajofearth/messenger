import { ConvexError, v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/identity";

type FileKind = "image" | "video" | "audio" | "file" | "avatar" | "story";

const fileKind = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("audio"),
  v.literal("file"),
  v.literal("avatar"),
  v.literal("story"),
);

/** Mirrors the 25 MiB cap the keyboard-media bridge applies before copying. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_FILENAME = 160;

function normalizeMime(kind: FileKind, value: string) {
  const mimeType = value.split(";")[0].trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(mimeType)) {
    throw new ConvexError("INVALID_MIME");
  }
  const allowed =
    kind === "file" ||
    (kind === "avatar" && mimeType.startsWith("image/")) ||
    (kind === "image" && mimeType.startsWith("image/")) ||
    (kind === "video" && mimeType.startsWith("video/")) ||
    (kind === "audio" && mimeType.startsWith("audio/")) ||
    (kind === "story" &&
      (mimeType.startsWith("image/") || mimeType.startsWith("video/")));
  if (!allowed) throw new ConvexError("INVALID_MIME");
  return mimeType;
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const finalizeUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    kind: fileKind,
    mimeType: v.string(),
    filename: v.string(),
    size: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const existing = await ctx.db
      .query("files")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (existing) {
      if (existing.ownerId !== actor.userId) throw new ConvexError("FILE_FORBIDDEN");
      return existing.storageId;
    }
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) throw new ConvexError("FILE_NOT_FOUND");
    // Storage knows the real size; the client-supplied number is never trusted.
    if (metadata.size <= 0) {
      // A throwing mutation rolls back storage deletion, so reject by returning
      // after the delete commits and let the client surface the error code.
      await ctx.storage.delete(args.storageId);
      return { error: "FILE_EMPTY" };
    }
    if (metadata.size > MAX_UPLOAD_BYTES) {
      await ctx.storage.delete(args.storageId);
      return { error: "FILE_TOO_LARGE" };
    }
    // The upload's Content-Type is set by the object that was actually stored.
    // Fall back to the client value only when storage did not record one.
    const storedMime = metadata.contentType?.split(";")[0].trim().toLowerCase();
    const claimedMime = args.mimeType.split(";")[0].trim().toLowerCase();
    const candidate =
      storedMime && storedMime !== "application/octet-stream"
        ? storedMime
        : claimedMime;
    let mimeType: string;
    try {
      mimeType = normalizeMime(args.kind, candidate);
    } catch {
      await ctx.storage.delete(args.storageId);
      return { error: "INVALID_MIME" };
    }
    await ctx.db.insert("files", {
      ownerId: actor.userId,
      storageId: args.storageId,
      kind: args.kind,
      mimeType,
      filename: args.filename.trim().slice(0, MAX_FILENAME) || "attachment",
      size: metadata.size,
      width: args.width,
      height: args.height,
      durationMs: args.durationMs,
      messageRefs: [],
      createdAt: Date.now(),
    });
    return args.storageId;
  },
});

/** Uploads that never became a message are swept once they are this old. */
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Reclaims storage the chat model cannot reclaim on its own: files rows whose
 * blob is gone, message uploads that never finalised, and `_storage` objects no
 * row protects. The grace period keeps an upload that is still in flight safe;
 * the cron repeats, so a bounded page of objects per run is enough.
 */
export const sweepOrphans = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let rows = 0;
    let blobs = 0;
    const kept: Array<{ storageId: Id<"_storage"> }> = [];

    for (const row of await ctx.db.query("files").collect()) {
      const metadata = await ctx.db.system.get("_storage", row.storageId);
      if (!metadata) {
        await ctx.db.delete(row._id);
        rows += 1;
        continue;
      }
      // Avatars and stories have no message refs by design, so the unused
      // check below must never expire them; their own flows own those blobs.
      const isMessageUpload =
        row.kind === "image" ||
        row.kind === "video" ||
        row.kind === "audio" ||
        row.kind === "file";
      const unused =
        row.messageRefs !== undefined &&
        row.messageRefs.length === 0 &&
        now - row.createdAt > ORPHAN_GRACE_MS;
      if (isMessageUpload && unused) {
        await ctx.db.delete(row._id);
        await ctx.storage.delete(row.storageId);
        rows += 1;
        continue;
      }
      kept.push(row);
    }

    const protectedIds = new Set<string>(kept.map((row) => row.storageId));
    for (const profile of await ctx.db.query("profiles").collect()) {
      if (profile.avatarStorageId) protectedIds.add(profile.avatarStorageId);
    }
    for (const story of await ctx.db.query("stories").collect()) {
      protectedIds.add(story.storageId);
    }

    const objects = await ctx.db.system.query("_storage").take(500);
    for (const object of objects) {
      if (now - object._creationTime < ORPHAN_GRACE_MS) continue;
      if (protectedIds.has(object._id)) continue;
      await ctx.storage.delete(object._id);
      blobs += 1;
    }

    return { rows, blobs };
  },
});

export type StoredFileId = Id<"files">;
