import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
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
    const metadata = await ctx.storage.getMetadata(args.storageId);
    if (!metadata) throw new ConvexError("FILE_NOT_FOUND");
    // Storage knows the real size; the client-supplied number is never trusted.
    if (metadata.size <= 0) throw new ConvexError("FILE_EMPTY");
    if (metadata.size > MAX_UPLOAD_BYTES) throw new ConvexError("FILE_TOO_LARGE");
    const mimeType = normalizeMime(args.kind, args.mimeType);
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
      createdAt: Date.now(),
    });
    return args.storageId;
  },
});

export type StoredFileId = Id<"files">;
