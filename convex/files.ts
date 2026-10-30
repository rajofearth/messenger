import { ConvexError, v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireUser } from "./lib/identity";
import {
  resolveMimeType,
  validateMediaVariants,
  type ValidatedMediaVariant,
} from "./lib/mediaVariantRules";
import { deleteMediaVariants } from "./lib/mediaVariants";

type FileKind = "image" | "video" | "audio" | "file" | "avatar" | "story";

const fileKind = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("audio"),
  v.literal("file"),
  v.literal("avatar"),
  v.literal("story"),
);

const mediaVariantArg = v.object({
  storageId: v.id("_storage"),
  name: v.string(),
  mimeType: v.string(),
  width: v.number(),
  height: v.number(),
  bytes: v.number(),
});

type MediaVariantArg = {
  storageId: Id<"_storage">;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
};

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

/** True when an existing row still points at this blob. */
async function isReferenced(ctx: MutationCtx, storageId: Id<"_storage">) {
  const file = await ctx.db
    .query("files")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
  if (file) return true;
  const variant = await ctx.db
    .query("mediaVariants")
    .withIndex("by_variant_storage", (q) =>
      q.eq("variantStorageId", storageId),
    )
    .first();
  return Boolean(variant);
}

/**
 * A failed finalize returns `{ error }` instead of throwing, because a throw
 * rolls back storage deletion. Every blob the request mentioned is removed
 * once, even when a client reused an id. A blob another row already references
 * is never deleted: a malformed request must not take live media with it.
 */
async function deleteUploads(
  ctx: MutationCtx,
  mainStorageId: Id<"_storage">,
  variants: readonly { storageId: Id<"_storage"> }[] | undefined,
) {
  const ids = new Set<Id<"_storage">>([mainStorageId]);
  for (const variant of variants ?? []) ids.add(variant.storageId);
  for (const id of ids) {
    if (await isReferenced(ctx, id)) continue;
    const metadata = await ctx.db.system.get("_storage", id);
    if (metadata) await ctx.storage.delete(id);
  }
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
    variants: v.optional(v.array(mediaVariantArg)),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const existing = await ctx.db
      .query("files")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (existing) {
      if (existing.ownerId !== actor.userId) throw new ConvexError("FILE_FORBIDDEN");
      // A retry already finalized the source; its variant rows are either
      // present or gone together with it. Never insert a second set.
      return existing.storageId;
    }
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) throw new ConvexError("FILE_NOT_FOUND");
    // Storage knows the real size; the client-supplied number is never trusted.
    if (metadata.size <= 0) {
      // A throwing mutation rolls back storage deletion, so reject by returning
      // after the delete commits and let the client surface the error code.
      await deleteUploads(ctx, args.storageId, args.variants);
      return { error: "FILE_EMPTY" };
    }
    if (metadata.size > MAX_UPLOAD_BYTES) {
      await deleteUploads(ctx, args.storageId, args.variants);
      return { error: "FILE_TOO_LARGE" };
    }
    // The upload's Content-Type is set by the object that was actually stored.
    // Fall back to the client value only when storage did not record one.
    const candidate = resolveMimeType(args.mimeType, metadata.contentType);
    let mimeType: string;
    try {
      mimeType = normalizeMime(args.kind, candidate);
    } catch {
      await deleteUploads(ctx, args.storageId, args.variants);
      return { error: "INVALID_MIME" };
    }

    const requested = args.variants ?? [];
    const validated: ValidatedMediaVariant<MediaVariantArg>[] = [];
    if (requested.length) {
      // Variants only describe image pixels; audio, video and generic files
      // must never smuggle a second blob past the main MIME check.
      if (!mimeType.startsWith("image/")) {
        await deleteUploads(ctx, args.storageId, args.variants);
        return { error: "INVALID_VARIANTS" };
      }
      // A variant is a new upload. Reusing a blob that a files row or another
      // variant row already owns would let one deletion remove someone else's
      // media, so refuse the whole batch instead.
      for (const variant of requested) {
        if (await isReferenced(ctx, variant.storageId)) {
          await deleteUploads(ctx, args.storageId, args.variants);
          return { error: "INVALID_VARIANTS" };
        }
      }
      const variantMetadata = await Promise.all(
        requested.map((variant) =>
          ctx.db.system.get("_storage", variant.storageId),
        ),
      );
      const metadataById = new Map<
        string,
        (typeof variantMetadata)[number]
      >();
      requested.forEach((variant, index) => {
        metadataById.set(String(variant.storageId), variantMetadata[index]);
      });
      const checked = validateMediaVariants(
        requested,
        String(args.storageId),
        (storageId) => {
          const info = metadataById.get(storageId);
          return info
            ? { size: info.size, contentType: info.contentType }
            : undefined;
        },
      );
      if (!checked || checked.length !== requested.length) {
        // One bad variant rejects the batch so a client retry sends the
        // original alone instead of a mismatched gallery.
        await deleteUploads(ctx, args.storageId, args.variants);
        return { error: "INVALID_VARIANTS" };
      }
      validated.push(...checked);
    }

    // Resolve every URL before writing rows. The source row's own URL is still
    // issued per query; a variant keeps one stable URL for its lifetime.
    const urls = await Promise.all(
      validated.map((variant) => ctx.storage.getUrl(variant.source.storageId)),
    );
    const resolved: Array<{
      variant: ValidatedMediaVariant<MediaVariantArg>;
      url: string;
    }> = [];
    for (const [index, variant] of validated.entries()) {
      const url = urls[index];
      if (!url) {
        await deleteUploads(ctx, args.storageId, args.variants);
        return { error: "INVALID_VARIANTS" };
      }
      resolved.push({ variant, url });
    }

    const now = Date.now();
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
      // Avatar and photo-story rows also benefit from the same flag, but only
      // an image can ever carry variant rows.
      variantsState: resolved.length
        ? "ready"
        : mimeType.startsWith("image/")
          ? "skipped"
          : undefined,
      createdAt: now,
    });
    for (const { variant, url } of resolved) {
      await ctx.db.insert("mediaVariants", {
        sourceStorageId: args.storageId,
        variantStorageId: variant.source.storageId,
        name: variant.source.name,
        width: variant.source.width,
        height: variant.source.height,
        bytes: variant.size,
        mimeType: variant.mimeType,
        url,
        createdAt: now,
      });
    }
    return args.storageId;
  },
});

/** Uploads that never became a message are swept once they are this old. */
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Reclaims storage nothing else owns: files rows whose blob is gone, message
 * uploads that never became a message, and `_storage` objects no row protects.
 * The grace period keeps an upload that is still in flight safe; the cron
 * repeats, so a bounded page of objects per run is enough.
 */
export const sweepOrphans = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let rows = 0;
    let blobs = 0;
    let variants = 0;
    const kept: Array<{ storageId: Id<"_storage"> }> = [];

    // An attachment exists on the server only while some recipient's queue row
    // points at it, so the queue is the whole reference set for a message blob.
    const queuedStorageIds = new Set<string>();
    for (const queued of await ctx.db.query("relayQueue").collect()) {
      if (queued.storageId) queuedStorageIds.add(queued.storageId);
    }

    for (const row of await ctx.db.query("files").collect()) {
      const metadata = await ctx.db.system.get("_storage", row.storageId);
      if (!metadata) {
        await deleteMediaVariants(ctx, row.storageId);
        await ctx.db.delete(row._id);
        rows += 1;
        continue;
      }
      // Avatars and stories have no queue entry by design, so the unused check
      // below must never expire them; their own flows own those blobs.
      const isMessageUpload =
        row.kind === "image" ||
        row.kind === "video" ||
        row.kind === "audio" ||
        row.kind === "file";
      const unused =
        now - row.createdAt > ORPHAN_GRACE_MS &&
        !queuedStorageIds.has(row.storageId);
      if (isMessageUpload && unused) {
        await deleteMediaVariants(ctx, row.storageId);
        await ctx.db.delete(row._id);
        await ctx.storage.delete(row.storageId);
        rows += 1;
        continue;
      }
      kept.push(row);
    }

    // A variant row is useful only while both of its storage objects exist.
    // Anything else is a partial write from a failed finalize or an older
    // deletion path, and it must not keep the generic sweep away.
    const keptVariants: Array<{ variantStorageId: Id<"_storage"> }> = [];
    for (const variant of await ctx.db.query("mediaVariants").collect()) {
      const [source, blob] = await Promise.all([
        ctx.db.system.get("_storage", variant.sourceStorageId),
        ctx.db.system.get("_storage", variant.variantStorageId),
      ]);
      if (source && blob) {
        keptVariants.push(variant);
        continue;
      }
      await ctx.db.delete(variant._id);
      variants += 1;
      // Without its source the variant can never be projected again.
      if (blob && !source) await ctx.storage.delete(variant.variantStorageId);
    }

    const protectedIds = new Set<string>(kept.map((row) => row.storageId));
    for (const profile of await ctx.db.query("profiles").collect()) {
      if (profile.avatarStorageId) protectedIds.add(profile.avatarStorageId);
    }
    for (const story of await ctx.db.query("stories").collect()) {
      protectedIds.add(story.storageId);
    }
    // Variant blobs are owned by their row, not by the generic `_storage`
    // sweep; without this the daily pass would delete every stored width.
    for (const variant of keptVariants) {
      protectedIds.add(variant.variantStorageId);
    }

    const objects = await ctx.db.system.query("_storage").take(500);
    for (const object of objects) {
      if (now - object._creationTime < ORPHAN_GRACE_MS) continue;
      if (protectedIds.has(object._id)) continue;
      await ctx.storage.delete(object._id);
      blobs += 1;
    }

    return { rows, blobs, variants };
  },
});

export type StoredFileId = Id<"files">;
