import {
  getAuthUserId,
  getAuthSessionId,
  invalidateSessions,
} from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireUser } from "./lib/identity";

const DAY_MS = 24 * 60 * 60 * 1000;

export const register = mutation({
  args: {
    deviceId: v.string(),
    label: v.string(),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const sessionId = await getAuthSessionId(ctx);
    if (!sessionId) throw new ConvexError("AUTH_SESSION_REQUIRED");
    const now = Date.now();
    const existing = await ctx.db
      .query("devices")
      .withIndex("by_user_device", (q) =>
        q.eq("userId", actor.userId).eq("deviceId", args.deviceId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        authSessionId: sessionId,
        label: args.label.trim() || "Android device",
        platform: args.platform,
        lastSeenAt: now,
        revokedAt: undefined,
      });
      return existing._id;
    }
    return await ctx.db.insert("devices", {
      userId: actor.userId,
      authSessionId: sessionId,
      deviceId: args.deviceId,
      label: args.label.trim() || "Android device",
      platform: args.platform,
      registeredAt: now,
      lastSeenAt: now,
    });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx);
    const sessionId = await getAuthSessionId(ctx);
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", actor.userId))
      .collect();
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_user", (q) => q.eq("userId", actor.userId))
      .collect();
    return devices
      .filter((device) => {
        const session = sessions.find((item) => item._id === device.authSessionId);
        return !!session && session.expirationTime > Date.now() && !device.revokedAt;
      })
      .map((device) => ({
        id: device._id,
        deviceId: device.deviceId,
        label: device.label,
        platform: device.platform,
        registeredAt: device.registeredAt,
        lastSeenAt: device.lastSeenAt,
        eligibleAt: device.registeredAt + DAY_MS,
        eligible: device.registeredAt + DAY_MS <= Date.now(),
        current: device.authSessionId === sessionId,
      }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  },
});

export const currentForRevoke = internalQuery({
  args: { userId: v.id("users"), sessionId: v.id("authSessions") },
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query("devices")
      .withIndex("by_session", (q) => q.eq("authSessionId", args.sessionId))
      .unique();
    return device && device.userId === args.userId ? device : null;
  },
});

export const markRevoked = internalMutation({
  args: { userId: v.id("users"), sessionId: v.id("authSessions") },
  handler: async (ctx, args) => {
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const now = Date.now();
    for (const device of devices) {
      if (device.authSessionId !== args.sessionId) {
        await ctx.db.patch(device._id, { revokedAt: now });
      }
    }
  },
});

export const revokeDevice = mutation({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const sessionId = await getAuthSessionId(ctx);
    if (!sessionId) throw new ConvexError("AUTH_SESSION_REQUIRED");
    const current = await ctx.db
      .query("devices")
      .withIndex("by_session", (q) => q.eq("authSessionId", sessionId))
      .unique();
    if (!current || current.userId !== actor.userId) {
      throw new ConvexError("DEVICE_NOT_REGISTERED");
    }
    if (current.registeredAt + DAY_MS > Date.now()) {
      throw new ConvexError("DEVICE_TOO_NEW");
    }
    if (current._id === args.deviceId) {
      throw new ConvexError("CANNOT_REVOKE_CURRENT_DEVICE");
    }
    const target = await ctx.db.get(args.deviceId);
    if (!target || target.userId !== actor.userId) {
      throw new ConvexError("DEVICE_NOT_FOUND");
    }
    await ctx.db.patch(target._id, { revokedAt: Date.now() });
    // Expiring the auth session makes the next request on that device fail.
    await ctx.db.patch(target.authSessionId, { expirationTime: Date.now() });
    return true;
  },
});

export const revokeOthers = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const sessionId = await getAuthSessionId(ctx);
    if (!userId || !sessionId) throw new ConvexError("AUTH_SESSION_REQUIRED");
    const current = await ctx.runQuery(internal.devices.currentForRevoke, {
      userId,
      sessionId,
    });
    if (!current || current.registeredAt + DAY_MS > Date.now()) {
      throw new ConvexError("DEVICE_TOO_NEW");
    }
    await invalidateSessions(ctx, { userId, except: [sessionId] });
    await ctx.runMutation(internal.devices.markRevoked, { userId, sessionId });
    return true;
  },
});

export const unregister = mutation({
  args: {},
  handler: async (ctx) => {
    const sessionId = await getAuthSessionId(ctx);
    if (!sessionId) return false;
    const device = await ctx.db
      .query("devices")
      .withIndex("by_session", (q) => q.eq("authSessionId", sessionId))
      .unique();
    if (device) await ctx.db.patch(device._id, { revokedAt: Date.now() });
    return true;
  },
});
