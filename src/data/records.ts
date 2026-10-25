/**
 * Persisted cache shapes for the local store. They mirror the domain types the
 * screens use, so the server projection and the device cache stay one mapping.
 */

import type { Chat, Message, Story } from "../domain/data";
import type { ThemePreference } from "../ui/theme";

export type AppearanceRecord = {
  /** Theme chosen in Settings; "system" follows the device. */
  theme: ThemePreference;
};

/** Shape written before the theme control gained its "system" option. */
export type LegacyAppearanceRecord = {
  dark: boolean;
};

export type ChatRecord = Chat;
export type MessageRecord = Message;
export type StoryRecord = Story;

/**
 * One outgoing message that has not been confirmed by the server yet. Kept
 * apart from the confirmed thread cache so a kill before the echo cannot lose
 * the bubble or its durable attachment copy.
 */
export type OutboxRecord = {
  chatId: string;
  message: MessageRecord;
};

export type CallHistoryRecord = {
  id: string;
  /** Contact snapshot taken when the call happened. */
  chat: ChatRecord;
  video: boolean;
  seconds: number;
  time: string;
  missed: boolean;
};

/** Profile and preference record owned by the settings screen. */
export type SettingsRecord = {
  name: string;
  bio: string;
  username: string;
  haptics: boolean;
  avatar: string;
  sound: boolean;
  previews: boolean;
  /** Master switch for Android system notifications. */
  systemNotifications: boolean;
};

/** An incoming call kept across process death so a notification answer can rebuild it. */
export type PendingCallRecord = {
  callId: string;
  chatId: string;
  video: boolean;
  /** Unix milliseconds when the incoming call notification was posted. */
  receivedAt: number;
  /** Ringing window in milliseconds, matching the notification timeout. */
  timeoutMs: number;
};

/**
 * The release a user has already declined. Kept per version code rather than
 * as a flag, so the next release is offered again.
 */
export type UpdateRecord = {
  dismissedVersionCode: number;
};
