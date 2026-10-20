import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const DEVICE_KEY = "messenger.device-id";

/**
 * A stable installation id, kept in secure storage so the device list survives
 * restarts and reinstalls of the JavaScript bundle.
 */
export async function deviceIdentity() {
  let deviceId = await SecureStore.getItemAsync(DEVICE_KEY);
  if (!deviceId) {
    deviceId = `${Platform.OS}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    await SecureStore.setItemAsync(DEVICE_KEY, deviceId);
  }
  return {
    deviceId,
    label: Platform.OS === "android" ? "Android device" : "iOS device",
    platform: `${Platform.OS} ${String(Platform.Version)}`,
  };
}
