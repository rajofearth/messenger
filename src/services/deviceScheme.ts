/**
 * The device scheme bridge, and the only file that knows the native module's
 * shape.
 *
 * React Native's own source cannot be trusted here: `Appearance` reads the
 * activity, and AppCompat pins the activity's configuration to the scheme the
 * device had when the activity was created, so a theme switch made while the
 * app runs never reaches JS. `modules/device-scheme` reads the application
 * context instead, which Android keeps in step with the device.
 *
 * Every call degrades instead of throwing when the module is absent (iOS, web,
 * Expo Go): the app then falls back to React Native's `useColorScheme`, which
 * is the same stale-only-on-Android value this bridge exists to replace.
 */

import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";
import { parseDeviceScheme } from "../ui/theme";
import type { DeviceScheme } from "../ui/theme";

type Subscription = { remove(): void };

interface DeviceSchemeNative {
  getDeviceScheme(): string;
  addListener(
    event: "onDeviceSchemeChanged",
    listener: (payload: { scheme: string }) => void,
  ): Subscription;
}

const native =
  Platform.OS === "android"
    ? requireOptionalNativeModule<DeviceSchemeNative>("DeviceScheme")
    : null;

/** True when the live device scheme comes from the native module. */
export const isDeviceSchemeAvailable = native !== null;

/** The device scheme now, or null when the native module is unavailable. */
export function getDeviceScheme(): DeviceScheme | null {
  if (!native) return null;
  return parseDeviceScheme(native.getDeviceScheme());
}

/** Calls back on every real device change; a no-op subscription elsewhere. */
export function subscribeToDeviceScheme(
  listener: (scheme: DeviceScheme) => void,
): Subscription {
  if (!native) return { remove() {} };
  return native.addListener("onDeviceSchemeChanged", ({ scheme }) => {
    const parsed = parseDeviceScheme(scheme);
    if (parsed) listener(parsed);
  });
}
