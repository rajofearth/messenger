/**
 * Android notification permission and channel status for the settings screen.
 *
 * Channel settings are owned by the user after creation, so the app never
 * pretends to switch them: it reports their state and opens the system screen.
 */

import { useCallback, useEffect, useState } from "react";
import {
  getStatus,
  isSystemNotificationsAvailable,
  openSettings,
  requestPermission,
  type NotificationStatus,
} from "../services/systemNotifications";

export type NotificationChannel = "incoming" | "calls" | "messages";

export function useNotificationSettings() {
  const [status, setStatus] = useState<NotificationStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (!isSystemNotificationsAvailable) return;
    try {
      setStatus(await getStatus());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const request = useCallback(async () => {
    if (!isSystemNotificationsAvailable || pending) return;
    setPending(true);
    try {
      setStatus(await requestPermission());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }, [pending]);

  const openChannel = useCallback((channel?: NotificationChannel) => {
    // Without this guard the bridge throws synchronously off Android, where the
    // rejection from openSettings has nowhere to land.
    if (!isSystemNotificationsAvailable) return;
    void openSettings(channel).catch(() => setFailed(true));
  }, []);

  return {
    available: isSystemNotificationsAvailable,
    status,
    pending,
    failed,
    refresh,
    request,
    openChannel,
  };
}
