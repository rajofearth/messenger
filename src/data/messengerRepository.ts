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
  LegacySnapshot,
  MessageRecord,
  PendingCallRecord,
  SettingsRecord,
  StoryRecord,
} from "./records";
export const asyncStorageDriver: StorageDriver = {
  read: (key) => AsyncStorage.getItem(key),
  write: (key, value) =>
    value === null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, value),
  keys: async () => [...(await AsyncStorage.getAllKeys())],
};

const LEGACY_KEY = "messenger-prototype-v1";
const LEGACY_SETTINGS_KEY = "@messenger/settings/v1";

export type MessengerRepository = ReturnType<typeof createMessengerRepository>;

export function createMessengerRepository(
  store: Store = createStore(asyncStorageDriver, `messenger/${STORE_VERSION}`),
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
    /** Messages live per conversation, so sending one never rewrites the rest. */
    loadMessages: (chatId: string) =>
      store.load<MessageRecord[]>(`messages/${chatId}`),
    saveMessages: (chatId: string, messages: MessageRecord[]) =>
      store.save(`messages/${chatId}`, messages),
    removeMessages: (chatId: string) => store.save(`messages/${chatId}`, null),
    loadPendingCall: () => store.load<PendingCallRecord>("pending-call"),
    savePendingCall: (call: PendingCallRecord | null) =>
      store.save("pending-call", call),
    /**
     * One-time upgrade from the single saved blob and the old settings key to
     * versioned slices. Returns true when anything was migrated.
     */
    async migrateLegacy(): Promise<boolean> {
      const [legacy, legacySettings] = await Promise.all([
        AsyncStorage.getItem(LEGACY_KEY),
        AsyncStorage.getItem(LEGACY_SETTINGS_KEY),
      ]);
      if (legacySettings) {
        try {
          await store.save("settings", JSON.parse(legacySettings) as SettingsRecord);
        } catch {
          // A malformed legacy settings blob is dropped instead of blocking.
        }
        await AsyncStorage.removeItem(LEGACY_SETTINGS_KEY);
      }
      if (!legacy) return !!legacySettings;
      try {
        const saved = JSON.parse(legacy) as LegacySnapshot;
        if (Array.isArray(saved.chats)) await store.save("chats", saved.chats);
        if (Array.isArray(saved.stories)) await store.save("stories", saved.stories);
        if (Array.isArray(saved.history)) await store.save("history", saved.history);
        if (typeof saved.dark === "boolean") {
          await store.save("appearance", {
            theme: saved.dark ? "dark" : "light",
          });
        }
        if (saved.messages && typeof saved.messages === "object") {
          for (const [chatId, thread] of Object.entries(saved.messages)) {
            if (Array.isArray(thread)) await store.save(`messages/${chatId}`, thread);
          }
        }
      } catch {
        // Unreadable legacy state: start from the seeded demo data.
      }
      await AsyncStorage.removeItem(LEGACY_KEY);
      return true;
    },
  };
  return repository;
}

/** Shared instance: every reader hits the same memory cache. */
export const messengerRepository = createMessengerRepository();
