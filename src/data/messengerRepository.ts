/**
 * One place that knows how messenger data is stored.
 *
 * Screens and hooks never touch storage keys: they read and write these typed
 * slices. Adding a backend later means adding a network-backed implementation
 * of the same calls (see docs/ARCHITECTURE.md), not editing UI code.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createStore, STORE_VERSION, type StorageDriver, type Store } from "./store";
import { normalizeAppearance } from "./appearance";
import type { ThemePreference } from "../ui/theme";
import type {
  AppearanceRecord,
  CallHistoryRecord,
  ChatRecord,
  LegacyAppearanceRecord,
  MessageRecord,
  PendingCallRecord,
  SettingsRecord,
  StoryRecord,
  UpdateRecord,
} from "./records";
export const asyncStorageDriver: StorageDriver = {
  read: (key) => AsyncStorage.getItem(key),
  write: (key, value) =>
    value === null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, value),
  keys: async () => [...(await AsyncStorage.getAllKeys())],
};

const STORE_NAMESPACE = `messenger/${STORE_VERSION}`;

export type MessengerRepository = ReturnType<typeof createMessengerRepository>;

export function createMessengerRepository(
  store: Store = createStore(asyncStorageDriver, STORE_NAMESPACE),
) {
  const repository = {
    store,
    loadAppearance: async () =>
      normalizeAppearance(
        await store.load<AppearanceRecord | LegacyAppearanceRecord>("appearance"),
      ),
    saveAppearance: (theme: ThemePreference) =>
      store.save("appearance", { theme }),
    loadChats: () => store.load<ChatRecord[]>("chats"),
    saveChats: (chats: ChatRecord[]) => store.save("chats", chats),
    loadStories: () => store.load<StoryRecord[]>("stories"),
    saveStories: (stories: StoryRecord[]) => store.save("stories", stories),
    loadHistory: () => store.load<CallHistoryRecord[]>("history"),
    saveHistory: (history: CallHistoryRecord[]) => store.save("history", history),
    loadSettings: () => store.load<SettingsRecord>("settings"),
    saveSettings: (settings: SettingsRecord) => store.save("settings", settings),
    /** Message ids already copied to the device gallery, so retries do not duplicate. */
    loadGallerySaved: () => store.load<string[]>("gallery-saved"),
    saveGallerySaved: (ids: string[]) => store.save("gallery-saved", ids),
    /** Messages live per conversation, so sending one never rewrites the rest. */
    loadMessages: (chatId: string) =>
      store.load<MessageRecord[]>(`messages/${chatId}`),
    saveMessages: (chatId: string, messages: MessageRecord[]) =>
      store.save(`messages/${chatId}`, messages),
    removeMessages: (chatId: string) => store.save(`messages/${chatId}`, null),
    loadPendingCall: () => store.load<PendingCallRecord>("pending-call"),
    savePendingCall: (call: PendingCallRecord | null) =>
      store.save("pending-call", call),
    loadDismissedRelease: () => store.load<UpdateRecord>("update"),
    saveDismissedRelease: (record: UpdateRecord | null) =>
      store.save("update", record),
    /** Signing out must not leave one account's messages for the next one. */
    clearAccountData: () => store.clear(),
  };
  return repository;
}

/** Shared instance: every reader hits the same memory cache. */
export const messengerRepository = createMessengerRepository();
