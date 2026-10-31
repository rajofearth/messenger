import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Deletes a stored blob only when it still exists. A deployment whose data was
 * wiped can leave rows pointing at storage ids that are already gone, and
 * `ctx.storage.delete` throws for those instead of treating them as absent.
 */
export async function deleteBlob(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
): Promise<boolean> {
  const metadata = await ctx.db.system.get("_storage", storageId);
  if (!metadata) return false;
  await ctx.storage.delete(storageId);
  return true;
}
