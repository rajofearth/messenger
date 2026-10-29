/**
 * Keeps the server's device row pointing at this install's current FCM token.
 *
 * Mounting this hook is already an authenticated mount: it lives in
 * `useRemoteMessenger`, which only renders inside the signed-in branch of
 * `AuthGate`. Registering a token is an upsert, so a relaunch that fetches the
 * same token is harmless and repairs a row that was never created (the server
 * answers null instead of failing). This never asks for the notification
 * permission and never throws.
 */

import { useEffect } from "react";
import { Platform } from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { currentPushToken, watchPushToken } from "../services/pushTokens";

/** The device row is created by its own mutation, so a null answer is a race. */
const REGISTER_ATTEMPTS = 3;
const RETRY_MS = 4000;

export function usePushRegistration() {
  const registerPushToken = useMutation(api.devices.registerPushToken);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    let active = true;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const register = (token: string, attempt = 1) => {
      if (!active) return;
      void registerPushToken({ token, platform: "android" })
        .then((stored) => {
          // `null` means the device row did not exist yet; retry a couple of
          // times instead of waiting for the next launch.
          if (stored !== null || !active || attempt >= REGISTER_ATTEMPTS) return;
          const timer = setTimeout(() => {
            timers.delete(timer);
            register(token, attempt + 1);
          }, RETRY_MS * attempt);
          timers.add(timer);
        })
        .catch(() => {});
    };

    void currentPushToken()
      .then((token) => {
        if (token) register(token);
      })
      .catch(() => {});

    // Rotation is best-effort on top of the launch upsert above.
    const stop = watchPushToken((token) => register(token));
    return () => {
      active = false;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      stop();
    };
  }, [registerPushToken]);
}
