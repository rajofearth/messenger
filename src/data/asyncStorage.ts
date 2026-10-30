/**
 * The remaining AsyncStorage slices.
 *
 * SQLite owns the messenger cache now. AsyncStorage stays for the values that
 * must be read before the database can open (the appearance theme), for data
 * owned by another subsystem (the notification action ledger, the last push
 * wake marker), and for the two records the repository keeps outside the
 * database (the dismissed release and the pending incoming call).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORE_VERSION, type StorageDriver } from "./store";

export const STORE_NAMESPACE = `messenger/${STORE_VERSION}`;

export const asyncStorageDriver: StorageDriver = {
  read: (key) => AsyncStorage.getItem(key),
  write: (key, value) =>
    value === null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, value),
  keys: async () => [...(await AsyncStorage.getAllKeys())],
};
