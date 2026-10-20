import { useEffect, useState } from "react";
import type { Chat, Message, Story } from "../domain/data";
import { messengerRepository } from "../data/messengerRepository";
import type { SettingsRecord } from "../data/records";
import { setHapticsEnabled } from "../ui/primitives";
import type { ThemePreference } from "../ui/theme";
import {
  DEFAULT_SETTINGS,
  type RemoteCallRecord,
} from "./remoteMessengerTypes";

/**
 * Owns the device copy of the messenger state. The network layer starts with
 * these values, so a cold start paints the last conversation list and thread
 * immediately instead of waiting for Convex.
 */
export function useRemoteCache() {
  const [cachedChats, setCachedChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [stories, setStories] = useState<Story[]>([]);
  const [history, setHistory] = useState<RemoteCallRecord[]>([]);
  const [settings, setSettings] = useState<SettingsRecord>(DEFAULT_SETTINGS);
  const [storedTheme, setStoredTheme] = useState<
    ThemePreference | undefined
  >();
  const [gallerySaved, setGallerySaved] = useState<string[]>([]);
  const [localReady, setLocalReady] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      messengerRepository.loadChats(),
      messengerRepository.loadStories(),
      messengerRepository.loadHistory(),
      messengerRepository.loadAppearance(),
      messengerRepository.loadSettings(),
      messengerRepository.loadGallerySaved(),
    ])
      .then(
        ([
          storedChats,
          storedStories,
          storedHistory,
          appearance,
          saved,
          savedMedia,
        ]) => {
        if (!active) return;
        if (storedChats) setCachedChats(storedChats);
        if (savedMedia) setGallerySaved(savedMedia);
        if (storedStories) {
          const now = Date.now();
          setStories(
            storedStories.filter(
              (story) => !story.expiresAt || story.expiresAt > now,
            ),
          );
        }
        if (storedHistory) setHistory(storedHistory as RemoteCallRecord[]);
        if (appearance) setStoredTheme(appearance.theme);
        if (saved) {
          setSettings({ ...DEFAULT_SETTINGS, ...saved });
          setHapticsEnabled(saved.haptics !== false);
        }
        setLocalReady(true);
      })
      .catch(() => setLocalReady(true));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!localReady) return;
    void messengerRepository.saveHistory(history).catch(() => {});
  }, [history, localReady]);

  useEffect(() => {
    if (!localReady) return;
    void messengerRepository.saveSettings(settings).catch(() => {});
  }, [localReady, settings]);

  useEffect(() => {
    if (!stories.length) return;
    const now = Date.now();
    const nextExpiry = stories.reduce(
      (soonest, story) =>
        story.expiresAt && story.expiresAt > now
          ? Math.min(soonest, story.expiresAt)
          : soonest,
      Number.POSITIVE_INFINITY,
    );
    if (!Number.isFinite(nextExpiry)) return;
    const timer = setTimeout(() => {
      setStories((current) => {
        const next = current.filter(
          (story) => !story.expiresAt || story.expiresAt > Date.now(),
        );
        return next.length === current.length ? current : next;
      });
    }, Math.max(0, nextExpiry - now) + 500);
    return () => clearTimeout(timer);
  }, [stories]);

  useEffect(() => {
    if (!localReady) return;
    void messengerRepository.saveGallerySaved(gallerySaved).catch(() => {});
  }, [gallerySaved, localReady]);

  return {
    cachedChats,
    setCachedChats,
    messages,
    setMessages,
    stories,
    setStories,
    history,
    setHistory,
    settings,
    setSettings,
    storedTheme,
    gallerySaved,
    setGallerySaved,
    localReady,
  };
}
