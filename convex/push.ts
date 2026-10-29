"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { GoogleAuth } from "google-auth-library";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { action, internalAction } from "./_generated/server";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const FCM_BASE_URL = "https://fcm.googleapis.com/v1/projects";
/** FCM accepts one message per request; this bounds parallel POSTs. */
const MAX_CONCURRENT_SENDS = 10;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 250;
/** Matches the client parser (`src/services/pushPayload.ts`). */
const MAX_QUEUE_ID_LENGTH = 128;
/** Placeholder queue id for the manual wake check only. */
const TEST_QUEUE_ID = "test";

type FcmCredentials = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

type SendResult = { sent: number; failed: number };

type SendOutcome = "sent" | "failed" | "dead";

function fcmCredentials(): FcmCredentials {
  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey = process.env.FCM_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("FCM_CREDENTIALS_MISSING");
  }
  return {
    projectId,
    clientEmail,
    // Convex stores the key with literal "\n" escapes; the signer needs real
    // newlines. docs/PUSH.md §4.
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
}

/**
 * Mint a short-lived OAuth token for the messaging scope. Never cached at
 * module scope: a Convex isolate is not durable, so a stale token would
 * outlive nothing and simply delay the handshake.
 */
async function fcmAccessToken(credentials: FcmCredentials): Promise<string> {
  const auth = new GoogleAuth({
    projectId: credentials.projectId,
    credentials: {
      project_id: credentials.projectId,
      client_email: credentials.clientEmail,
      private_key: credentials.privateKey,
    },
    scopes: [FCM_SCOPE],
  });
  const token = await auth.getAccessToken();
  if (!token) throw new Error("FCM_ACCESS_TOKEN_MISSING");
  return token;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Data-only wake: no title, body, sender, preview or media URL ever leaves
 * Convex. `v` lets the wire shape change later; `ttl` stays short because a
 * stale wake has nothing to deliver that the next foreground drain would not.
 */
function wakePayload(deviceToken: string, queueId: string): string {
  return JSON.stringify({
    message: {
      token: deviceToken,
      data: { v: "1", type: "wake", queueId },
      android: { priority: "high", ttl: "60s" },
    },
  });
}

/**
 * A token FCM can never accept again. `SENDER_ID_MISMATCH` means the token was
 * minted for another Firebase project (a dev APK's token sent from the wrong
 * deployment, or a rotated project id), so it is dead here and retrying it
 * forever would hide the misconfiguration.
 */
function isDeadTokenResponse(status: number, body: string): boolean {
  if (status === 403) return /SENDER_ID_MISMATCH/i.test(body);
  if (status !== 404 && status !== 400) return false;
  return /UNREGISTERED|registration token/i.test(body);
}

/**
 * One HTTP v1 send for one token. Returns `dead` only when FCM says the token
 * itself is gone (404 `UNREGISTERED`, 400 "not a valid ... registration
 * token"); every other failure is transient or a config problem.
 */
async function sendToToken(
  projectId: string,
  bearer: string,
  deviceToken: string,
  queueId: string,
): Promise<SendOutcome> {
  const url = `${FCM_BASE_URL}/${projectId}/messages:send`;
  const payload = wakePayload(deviceToken, queueId);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let status = 0;
    let body = "";
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
        },
        body: payload,
      });
      status = response.status;
      body = await response.text();
    } catch (error) {
      // Network failure: treat like a 5xx and retry with backoff.
      console.warn("[push] fcm request failed", {
        attempt,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (status >= 200 && status < 300) return "sent";
    if (isDeadTokenResponse(status, body)) {
      console.warn("[push] fcm rejected a dead token", { status });
      return "dead";
    }
    // FCM's documented minimum backoff for 429 is one minute; an action must
    // not sit on a request that long, so count it as failed.
    if (status === 429) {
      console.warn("[push] fcm quota exceeded, not retrying", { status });
      return "failed";
    }
    const retryable = status === 0 || status >= 500;
    if (!retryable) {
      // 400 without a dead-token message, plus 401/403, mean the request or the
      // credentials are wrong: retrying changes nothing, but the status has to
      // reach the log or the failure looks like flaky delivery.
      console.warn("[push] fcm rejected the wake", { status });
      return "failed";
    }
    if (attempt === MAX_ATTEMPTS) return "failed";
    const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1);
    await sleep(backoff + Math.floor(Math.random() * BASE_BACKOFF_MS));
  }
  return "failed";
}

/**
 * Send one wake per token, at most `MAX_CONCURRENT_SENDS` in flight. A token
 * FCM calls dead is cleared in the same run so it is never retried.
 */
async function deliver(
  ctx: ActionCtx,
  tokens: string[],
  queueId: string,
): Promise<SendResult> {
  // The client parser drops anything longer, which would make every wake for
  // that entry silently useless, so refuse the wake here instead.
  if (queueId.length === 0 || queueId.length > MAX_QUEUE_ID_LENGTH) {
    throw new ConvexError("QUEUE_ID_INVALID");
  }
  const unique = Array.from(
    new Set(tokens.map((token) => token.trim()).filter(Boolean)),
  );
  if (unique.length === 0) return { sent: 0, failed: 0 };
  const credentials = fcmCredentials();
  const bearer = await fcmAccessToken(credentials);
  let sent = 0;
  let failed = 0;
  let next = 0;
  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENT_SENDS, unique.length) },
    async () => {
      while (next < unique.length) {
        const index = next;
        next += 1;
        const token = unique[index];
        const outcome = await sendToToken(
          credentials.projectId,
          bearer,
          token,
          queueId,
        );
        if (outcome === "sent") {
          sent += 1;
          continue;
        }
        failed += 1;
        if (outcome === "dead") {
          await ctx.runMutation(internal.devices.clearDeadToken, { token });
        }
      }
    },
  );
  await Promise.all(workers);
  return { sent, failed };
}

/**
 * Wake a fixed set of tokens. The queue write schedules this, so a failed send
 * cannot roll back the message: a wake is a hint, not delivery proof.
 */
export const sendWake = internalAction({
  args: { tokens: v.array(v.string()), queueId: v.string() },
  handler: async (ctx, args): Promise<SendResult> => {
    return await deliver(ctx, args.tokens, args.queueId);
  },
});

/** Wake every live device of one user; used by the queue's insert path. */
export const wakeUser = internalAction({
  args: { userId: v.id("users"), queueId: v.string() },
  handler: async (ctx, args): Promise<SendResult> => {
    const tokens: Array<{ token: string }> = await ctx.runQuery(
      internal.devices.tokensForUser,
      { userId: args.userId },
    );
    return await deliver(
      ctx,
      tokens.map((entry) => entry.token),
      args.queueId,
    );
  },
});

/**
 * DEVELOPMENT AID — not part of the relay contract: wakes the caller's own
 * devices with the placeholder queue id `test`, so the FCM path (credentials,
 * token registration, native receive) can be verified before the queue exists.
 * Refuses unless `PUSH_ALLOW_TEST_WAKE=1` is set on the deployment, because a
 * public action that spends FCM quota on demand is not production surface.
 * Delete it once `wakeUser` has a real caller.
 */
export const sendTestWake = action({
  args: {},
  handler: async (ctx): Promise<SendResult> => {
    if (process.env.PUSH_ALLOW_TEST_WAKE !== "1") {
      throw new ConvexError("TEST_WAKE_DISABLED");
    }
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("AUTH_REQUIRED");
    const tokens: Array<{ token: string }> = await ctx.runQuery(
      internal.devices.tokensForUser,
      { userId },
    );
    return await deliver(
      ctx,
      tokens.map((entry) => entry.token),
      TEST_QUEUE_ID,
    );
  },
});
