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

// Convex Auth namespaces its SecureStore keys by deployment. The headless
// notification task uses the same derivation without mounting the provider.
const authNamespace = url.replace(/[^a-zA-Z0-9]/g, "");
const authJwtKey = `__convexAuthJWT_${authNamespace}`;

export const secureTokenStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

export const readStoredAuthToken = () => SecureStore.getItemAsync(authJwtKey);
