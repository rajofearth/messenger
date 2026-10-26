import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** The public shape a message or story projection returns. */
export type MediaVariantView = {
  name: string;
  width: number;
  height: number;
  uri: string;
  mimeType: string;
};

type VariantCtx = QueryCtx | MutationCtx;

/** Smallest width first, matching the picker's ordering. */
export async function readMediaVariants(
  ctx: VariantCtx,
  sourceStorageId: Id<"_storage">,
): Promise<MediaVariantView[]> {
  const rows = await ctx.db
    .query("mediaVariants")
    .withIndex("by_source", (q) => q.eq("sourceStorageId", sourceStorageId))
    .collect();
  // The URL was resolved at write time; a projection never needs `getUrl`.
  return rows
    .map((row) => ({
      name: row.name,
      width: row.width,
      height: row.height,
      uri: row.url,
      mimeType: row.mimeType,
    }))
    .sort((a, b) => a.width - b.width);
}

/**
 * Removes every variant row and blob for a source. Callers must be sure the
 * source itself is going away; a forward still shares the source storage id.
 */
export async function deleteMediaVariants(
  ctx: MutationCtx,
  sourceStorageId: Id<"_storage">,
): Promise<number> {
  const rows = await ctx.db
    .query("mediaVariants")
    .withIndex("by_source", (q) => q.eq("sourceStorageId", sourceStorageId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
    const metadata = await ctx.db.system.get("_storage", row.variantStorageId);
    if (metadata) await ctx.storage.delete(row.variantStorageId);
  }
  return rows.length;
}
