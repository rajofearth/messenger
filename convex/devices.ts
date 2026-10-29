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
/** FCM tokens are ~150 chars; the cap only stops a junk row. */
const PUSH_TOKEN_MAX_LENGTH = 4096;
/** One wake per device is enough; this bounds a single user's fan-out. */
const MAX_PUSH_TARGETS = 20;

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

/**
 * Store the FCM registration token on the caller's device row. The client
 * registers the device first and calls this right after, so a missing row is a
 * race rather than an error: return null and let the next register fix it.
 */
export const registerPushToken = mutation({
  args: { token: v.string(), platform: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const token = args.token.trim();
    if (!token) throw new ConvexError("PUSH_TOKEN_REQUIRED");
    if (token.length > PUSH_TOKEN_MAX_LENGTH) {
      throw new ConvexError("PUSH_TOKEN_INVALID");
    }
    const sessionId = await getAuthSessionId(ctx);
    if (!sessionId) return null;
    const device = await ctx.db
      .query("devices")
      .withIndex("by_session", (q) => q.eq("authSessionId", sessionId))
      .unique();
    if (!device || device.userId !== actor.userId) return null;
    // An FCM token names one install, so it can only belong to one account.
    // Sign-out normally clears the old row, but a failed mutation or a crash
    // would leave the token attached to the previous user, and every message
    // for that user would wake the phone now signed in as someone else.
    const holders = await ctx.db
      .query("devices")
      .withIndex("by_pushToken", (q) => q.eq("pushToken", token))
      .collect();
    const now = Date.now();
    for (const holder of holders) {
      if (holder._id === device._id) continue;
      await ctx.db.patch(holder._id, {
        pushToken: undefined,
        pushRevokedAt: now,
      });
    }
    await ctx.db.patch(device._id, {
      pushToken: token,
      pushPlatform: args.platform.trim(),
      pushUpdatedAt: now,
      pushRevokedAt: undefined,
    });
    return true;
  },
});

/**
 * Drop the caller's token. Sign-out uses this before the session goes away;
 * the row keeps the revoke stamp so even a stale token is never woken.
 */
export const clearPushToken = mutation({
  args: {},
  handler: async (ctx) => {
    const sessionId = await getAuthSessionId(ctx);
    if (!sessionId) return false;
    const device = await ctx.db
      .query("devices")
      .withIndex("by_session", (q) => q.eq("authSessionId", sessionId))
      .unique();
    if (!device) return false;
    await ctx.db.patch(device._id, {
      pushToken: undefined,
      pushRevokedAt: Date.now(),
    });
    return true;
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

/**
 * Live push tokens for one user. A wake must never reach a device whose
 * session expired or was revoked, so the session is checked the same way
 * `list` checks it.
 */
export const tokensForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect();
    const live = new Set(
      sessions
        .filter((session) => session.expirationTime > Date.now())
        .map((session) => session._id),
    );
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const tokens: Array<{ token: string }> = [];
    for (const device of devices) {
      if (!device.pushToken) continue;
      if (device.pushRevokedAt !== undefined) continue;
      if (device.revokedAt !== undefined) continue;
      if (!live.has(device.authSessionId)) continue;
      tokens.push({ token: device.pushToken });
      if (tokens.length === MAX_PUSH_TARGETS) break;
    }
    return tokens;
  },
});

/**
 * Forget a token FCM reported as dead (uninstall, restore, token rotation).
 * Only an action can reach FCM, so this lives beside the registry and is
 * called from `convex/push.ts`.
 */
export const clearDeadToken = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_pushToken", (q) => q.eq("pushToken", args.token))
      .collect();
    const now = Date.now();
    for (const device of devices) {
      await ctx.db.patch(device._id, {
        pushToken: undefined,
        pushRevokedAt: now,
      });
    }
    return devices.length;
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
    if (device) {
      const now = Date.now();
      // Sign-out kills the token as well as the session, so nothing can wake
      // a device the user has already left.
      await ctx.db.patch(device._id, {
        revokedAt: now,
        pushToken: undefined,
        pushRevokedAt: now,
      });
    }
    return true;
  },
});
