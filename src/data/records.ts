/**
 * Persisted record shapes for the local store, kept explicit and versioned so a
 * future HTTP backend can map them one to one instead of reshaping UI state.
 * Version bumps are handled in `src/state/migrations.ts`.
 */

import type { Chat, Message, Story } from "../domain/data";

export type AppearanceRecord = {
  dark: boolean;
};

export type ChatRecord = Chat;
export type MessageRecord = Message;
export type StoryRecord = Story;

export type ConversationRecord = {
  chatId: string;
  messages: MessageRecord[];
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

/** Legacy single-blob state written by earlier versions of the app. */
export type LegacySnapshot = {
  chats?: ChatRecord[];
  messages?: Record<string, MessageRecord[]>;
  stories?: StoryRecord[];
  history?: CallHistoryRecord[];
  dark?: boolean;
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
