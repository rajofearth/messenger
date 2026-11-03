/**
 * The background wake task.
 *
 * A data-only FCM message reaches this task in the foreground, in the
 * background and when the process was terminated; a force-stopped app gets
 * nothing. The payload is a `RemoteMessage`, so the wake lives at
 * `data.data` — see `parseWake`. A wake carries no content and posts no
 * notification: the Kotlin module owns every Android channel, while this task
 * drains the authenticated relay and builds the local notification snapshot.
 */

import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { ConvexHttpClient } from "convex/browser";
import { asyncStorageDriver } from "../data/asyncStorage";
import { createStore } from "../data/store";
import { readStoredAuthToken } from "./convexClient";
import { runBackgroundNotificationWork } from "./backgroundNotificationWork";
import { parseWake } from "./pushPayload";

export const PUSH_WAKE_TASK = "messenger-push-wake";

const WAKE_KEY = "lastWake";

export type LastWake = { queueId: string; receivedAt: number };

const store = createStore(asyncStorageDriver, "push/v1");
let running: Promise<void> | null = null;

async function recordWake(queueId: string): Promise<void> {
  try {
    await store.save<LastWake>(WAKE_KEY, { queueId, receivedAt: Date.now() });
  } catch {
    // Losing the marker only hides the wake from diagnostics; the next one
    // overwrites it anyway.
  }
}

async function handleWake(queueId: string): Promise<void> {
  const token = await readStoredAuthToken().catch(() => null);
  const url = process.env.EXPO_PUBLIC_CONVEX_URL;
  if (!token || !url) {
    await recordWake(queueId);
    return;
  }
  const client = new ConvexHttpClient(url, { logger: false });
  client.setAuth(token);
  await runBackgroundNotificationWork(client, queueId);
  await recordWake(queueId);
}

if (Platform.OS === "android") {
  // Must run at module scope: the OS loads this bundle with no views mounted.
  TaskManager.defineTask(PUSH_WAKE_TASK, async ({ data, error }) => {
    if (error) return;
    // `data` is untrusted network input: parse it, never index into it.
    const wake = parseWake(data);
    if (!wake) return;
    // Serialize overlapping FCM deliveries. A single drain may acknowledge a
    // whole page, so a second task must not race it and post stale snapshots.
    if (!running) {
      running = handleWake(wake.queueId).catch(() => {}).finally(() => {
        running = null;
      });
    }
    await running;
  });
}

/** Safe to call on every launch; a failure only disables background wakes. */
export async function registerBackgroundWake(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    if (!(await TaskManager.isAvailableAsync())) return;
    await Notifications.registerTaskAsync(PUSH_WAKE_TASK);
  } catch {
    // Expo Go, no Play services, or a denied permission. Foreground behavior
    // and every other feature must still work.
  }
}
