import {
  getAuthUserId,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery } from "./_generated/server";
import { requireUser } from "./lib/identity";

/** The password provider uses the username as its account id. */
export const passwordAccountForCurrentUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", actor.userId))
      .unique();
    return {
      userId: actor.userId,
      username: profile?.username,
    };
  },
});

/**
 * Changes the password of the signed-in account. A signed-out reset is
 * deliberately unsupported, so the current password is verified here.
 */
export const changePassword = action({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("AUTH_REQUIRED");
    if (args.newPassword.length < 8) {
      throw new ConvexError("PASSWORD_TOO_SHORT");
    }
    if (args.newPassword === args.currentPassword) {
      throw new ConvexError("PASSWORD_UNCHANGED");
    }
    const account = await ctx.runQuery(
      internal.security.passwordAccountForCurrentUser,
      {},
    );
    if (!account.username) throw new ConvexError("PROFILE_NOT_READY");
    try {
      const verified = await retrieveAccount(ctx, {
        provider: "password",
        account: {
          id: account.username,
          secret: args.currentPassword,
        },
      });
      if (verified.user._id !== userId) throw new Error("wrong account");
    } catch {
      throw new ConvexError("CURRENT_PASSWORD_INVALID");
    }
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: {
        id: account.username,
        secret: args.newPassword,
      },
    });
    return true;
  },
});
