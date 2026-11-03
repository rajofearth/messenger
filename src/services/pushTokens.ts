/**
 * Device push tokens, Android only.
 *
 * Nothing here may crash: these calls run on launch, on sign-out and inside a
 * background task, where a missing Play service or a denied permission is a
 * normal answer, not an error. No function in this module asks for the
 * notification permission; the app prompts from its own settings surface.
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

type DevicePushToken = Awaited<
  ReturnType<typeof Notifications.getDevicePushTokenAsync>
>;

/** The FCM registration token, or null for every other platform. */
function androidToken(token: DevicePushToken): string | null {
  if (token.type !== "android") return null;
  const data: unknown = token.data;
  return typeof data === "string" && data.length > 0 ? data : null;
}

/**
 * The token to upsert for this install. Called on every launch because token
 * rotation events are best-effort: a missed one would leave the server waking
 * a dead token until the next launch.
 */
export async function currentPushToken(): Promise<string | null> {
  if (Platform.OS !== "android") return null;
  try {
    return androidToken(await Notifications.getDevicePushTokenAsync());
  } catch {
    return null;
  }
}

/** Follows token rotation. Returns the unsubscribe function, never null. */
export function watchPushToken(onToken: (token: string) => void): () => void {
  if (Platform.OS !== "android") return () => {};
  try {
    const subscription = Notifications.addPushTokenListener((token) => {
      try {
        const value = androidToken(token);
        if (value) onToken(value);
      } catch {
        // A listener must never take down the emitter.
      }
    });
    return () => {
      try {
        subscription.remove();
      } catch {
        // Already detached.
      }
    };
  } catch {
    return () => {};
  }
}

/**
 * Deletes the FCM token named by `deleteToken()`; there is no other native
 * delete. The caller revokes the server row first, because a token deleted
 * locally can no longer be cleared from the server afterwards.
 */
export async function releasePushToken(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.unregisterForNotificationsAsync();
  } catch {
    // The row is already revoked, so a token left behind is inert.
  }
}
