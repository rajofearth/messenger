/**
 * The background wake task.
 *
 * A data-only FCM message reaches this task in the foreground, in the
 * background and when the process was terminated; a force-stopped app gets
 * nothing. The payload is a `RemoteMessage`, so the wake lives at
 * `data.data` — see `parseWake`. A wake carries no content and posts no
 * notification: the Kotlin module already owns every Android channel.
 */

import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { asyncStorageDriver } from "../data/asyncStorage";
import { createStore } from "../data/store";
import { parseWake } from "./pushPayload";

export const PUSH_WAKE_TASK = "messenger-push-wake";

const WAKE_KEY = "lastWake";

export type LastWake = { queueId: string; receivedAt: number };

// Deliberately not the messenger namespace: a wake is a device event, and this
// task must not import the repository, whose module scope opens SQLite and runs
// the legacy import. A headless launch does none of that.
const store = createStore(asyncStorageDriver, "push/v1");

async function recordWake(queueId: string): Promise<void> {
  try {
    await store.save<LastWake>(WAKE_KEY, { queueId, receivedAt: Date.now() });
  } catch {
    // Losing the marker only hides the wake from diagnostics; the next one
    // overwrites it anyway.
  }
}

if (Platform.OS === "android") {
  // Must run at module scope: the OS loads this bundle with no views mounted.
  TaskManager.defineTask(PUSH_WAKE_TASK, async ({ data, error }) => {
    if (error) return;
    // `data` is untrusted network input: parse it, never index into it.
    const wake = parseWake(data);
    if (!wake) return;
    // R2 seam: fetch the relay queue entry named by `wake.queueId`, save it to
    // SQLite, and acknowledge the queue only after that commit. Until the
    // queue exists, a wake is only recorded so the path is observable.
    await recordWake(wake.queueId);
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
