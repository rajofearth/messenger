import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const CHAT_SCOPE = "messenger";

export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("AUTH_REQUIRED");
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("AUTH_REQUIRED");
  return { userId, user, subjectId: userId.toString(), scopeId: CHAT_SCOPE };
}

export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export function validateUsername(value: string): string {
  const username = normalizeUsername(value);
  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    throw new ConvexError("INVALID_USERNAME");
  }
  return username;
}
