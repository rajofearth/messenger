import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { releaseProblem } from "./lib/manifest";

/**
 * The highest version code is the only release the feed serves. The index
 * makes this a single backwards range read, not a table scan.
 */
export const latest = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("releases")
      .withIndex("by_versionCode")
      .order("desc")
      .first();
  },
});

/**
 * Publishes one APK to the feed. CI calls this after the GitHub release exists:
 *
 *   npx convex run --prod releases:publish '{"versionCode":4,...}'
 *
 * Re-publishing the same version code replaces its row, so a retried workflow
 * is safe. A version code below the current head would move the feed backwards
 * and is rejected unless that row already exists.
 */
export const publish = internalMutation({
  args: {
    versionCode: v.number(),
    versionName: v.string(),
    apkUrl: v.string(),
    apkSha256: v.string(),
    apkBytes: v.number(),
    minVersionCode: v.optional(v.number()),
    mandatory: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const release = {
      versionCode: args.versionCode,
      versionName: args.versionName.trim(),
      apkUrl: args.apkUrl.trim(),
      apkSha256: args.apkSha256.toLowerCase(),
      apkBytes: args.apkBytes,
      minVersionCode: args.minVersionCode ?? args.versionCode,
      mandatory: args.mandatory ?? false,
      notes: (args.notes ?? "").trim(),
    };
    const problem = releaseProblem(release);
    if (problem) throw new Error(`Release rejected: ${problem}`);

    const latestRelease = await ctx.db
      .query("releases")
      .withIndex("by_versionCode")
      .order("desc")
      .first();
    const existing = await ctx.db
      .query("releases")
      .withIndex("by_versionCode", (query) =>
        query.eq("versionCode", release.versionCode),
      )
      .unique();

    if (!existing && latestRelease && release.versionCode < latestRelease.versionCode) {
      throw new Error(
        `Release ${release.versionCode} is below the current feed ` +
          `(${latestRelease.versionCode}); bump the version code instead.`,
      );
    }

    const publishedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...release, publishedAt });
      return { versionCode: release.versionCode, action: "updated" as const };
    }
    await ctx.db.insert("releases", { ...release, publishedAt });
    return { versionCode: release.versionCode, action: "inserted" as const };
  },
});
