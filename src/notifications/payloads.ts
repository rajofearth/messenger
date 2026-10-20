/**
 * Builds native notification payloads from app data.
 *
 * Pure on purpose: avatars arrive as already-resolved local URIs and timestamps
 * are computed from the message records, so this file can be tested without
 * Android, storage or React.
 */

import type { Chat, Message } from "../domain/data";
import type {
  CallNotification,
  MessageNotification,
  NotificationPerson,
} from "../services/systemNotifications";

/** Android's MessagingStyle keeps a bounded thread; native stores the last 25. */
export const NOTIFICATION_MESSAGE_LIMIT = 25;

export type CallNotificationState = "incoming" | "outgoing" | "ongoing";

export type CallPayloadInput = {
  callId: string;
  chat: Chat;
  state: CallNotificationState;
  video: boolean;
  /** Unix milliseconds of connection, required once the call is ongoing. */
  connectedAt?: number;
  muted?: boolean;
  speaker?: boolean;
  /** Local file URI for the avatar, already resolved from the remote URL. */
  avatarUri?: string;
  timeoutMs?: number;
};

export function person(
  id: string,
  name: string,
  avatarUri?: string,
): NotificationPerson {
  return { id, name: name.trim() || "Unknown", avatarUri };
}

export function callPayload({
  callId,
  chat,
  state,
  video,
  connectedAt,
  muted,
  speaker,
  avatarUri,
  timeoutMs,
}: CallPayloadInput): CallNotification {
  const ongoing = state === "ongoing";
  return {
    callId,
    person: person(chat.id, chat.name, avatarUri),
    state,
    video,
    // Mute and speaker buttons are only offered where the call engine can act.
    allowMute: ongoing,
    allowSpeaker: ongoing,
    muted: ongoing ? !!muted : undefined,
    speaker: ongoing ? !!speaker : undefined,
    connectedAt: ongoing ? connectedAt : undefined,
    timeoutMs: state === "incoming" ? timeoutMs : undefined,
  };
}

/** Short label for messages whose body is media rather than text. */
export function messageLabel(message: Message): string {
  if (message.deleted) return "Message deleted";
  if (message.kind === "image") return "📷 Photo";
  if (message.kind === "video") return "🎬 Video";
  if (message.kind === "audio") return "🎤 Voice message";
  if (message.kind === "file") return `📄 ${message.filename || "File"}`;
  return message.text?.trim() || "New message";
}

/** Messages without a recorded date are spaced one second apart before `now`. */
function baseTimestamp(message: Message, index: number, total: number, now: number) {
  const parsed = message.createdAt ? Date.parse(message.createdAt) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return now - (total - 1 - index) * 1000;
}

/** MessagingStyle orders by timestamp, so keep the thread strictly increasing. */
function ascending(times: number[]): number[] {
  let previous = 0;
  return times.map((time) => {
    const value = time > previous ? time : previous + 1;
    previous = value;
    return value;
  });
}

export type MessagePayloadInput = {
  chat: Chat;
  messages: Message[];
  self: { id: string; name: string; avatarUri?: string };
  /** Local file URIs keyed by a stable person id. */
  avatars?: Record<string, string | undefined>;
  /** When off, bodies are replaced by a single neutral line. */
  previews: boolean;
  /** When off, the notification uses the silent Android channel. */
  sound?: boolean;
  /** Unix milliseconds used to space messages without a recorded date. */
  now?: number;
};

/**
 * Returns `null` when there is nothing worth notifying about. Only incoming
 * messages are ever announced.
 */
export function messagePayload({
  chat,
  messages,
  self,
  avatars = {},
  previews,
  sound = true,
  now = Date.now(),
}: MessagePayloadInput): MessageNotification | null {
  const received = messages.filter((message) => !message.mine);
  if (!received.length) return null;
  const recent = received.slice(-NOTIFICATION_MESSAGE_LIMIT);
  const times = ascending(
    recent.map((message, index) =>
      baseTimestamp(message, index, recent.length, now),
    ),
  );
  const contact = person(chat.id, chat.name, avatars[chat.id]);
  const group = !!chat.group;
  return {
    conversationId: chat.id,
    self: person(self.id, self.name, self.avatarUri),
    title: group ? chat.name : undefined,
    isGroup: group,
    silent: !sound,
    messages: recent.map((message, index) => ({
      text: previews ? messageLabel(message) : "New message",
      timestamp: times[index],
      // Direct conversations show the contact as the sender; the client payload
      // does not project per-message sender names, so the group name is used.
      sender: contact,
    })),
  };
}
