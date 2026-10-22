import { ConvexReactClient } from "convex/react";
import * as SecureStore from "expo-secure-store";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!url) {
  throw new Error(
    "EXPO_PUBLIC_CONVEX_URL is missing. Configure the Convex deployment before starting Messenger.",
  );
}

export const convexClient = new ConvexReactClient(url, {
  unsavedChangesWarning: false,
});

export const secureTokenStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};
