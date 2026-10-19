import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * One row per published APK. The feed only reads the highest version code,
 * but keeping history makes a bad publish visible and lets the publish
 * mutation reject a release that would move the feed backwards.
 */
export default defineSchema({
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
});
