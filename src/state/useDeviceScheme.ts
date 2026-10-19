/**
 * The device scheme, kept live.
 *
 * React Native's `useColorScheme` stops reporting changes once the app sets a
 * night mode (see `src/services/deviceScheme.ts`), so the device itself is the
 * source. The native module reports every change while the app runs, and React
 * Native's value is only the fallback when that module is unavailable (iOS,
 * web, Expo Go).
 *
 * The value is re-read when the app comes back to the foreground: a change made
 * while it was stopped need not be delivered to the process, and the read is
 * free.
 */

import { useEffect, useState } from "react";
import { AppState, useColorScheme } from "react-native";
import {
  getDeviceScheme,
  subscribeToDeviceScheme,
} from "../services/deviceScheme";
import type { DeviceScheme } from "../ui/theme";

export function useDeviceScheme(): DeviceScheme {
  const fallback = useColorScheme();
  const [scheme, setScheme] = useState<DeviceScheme>(() => getDeviceScheme());

  useEffect(() => {
    const subscription = subscribeToDeviceScheme((next) => setScheme(next));
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") setScheme(getDeviceScheme());
    });
    return () => {
      subscription.remove();
      appState.remove();
    };
  }, []);

  return scheme ?? fallback;
}
