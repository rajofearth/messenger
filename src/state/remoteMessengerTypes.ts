import type { Chat, Message, Story } from "../domain/data";
import type { SettingsRecord } from "../data/records";

export type RemoteProfile = {
  name: string;
  avatar: string;
  sound: boolean;
  previews: boolean;
  bio?: string;
  username?: string;
  haptics?: boolean;
  systemNotifications?: boolean;
};

export type RemoteCallRecord = {
  id: string;
  chat: Chat;
  video: boolean;
  seconds: number;
  time: string;
  missed: boolean;
};

export const remoteUid = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const DEFAULT_SETTINGS: SettingsRecord = {
  name: "Messenger user",
  bio: "",
  username: "",
  haptics: true,
  avatar: "",
  sound: true,
  previews: true,
  systemNotifications: true,
};

export function timeLabel(at: number | Date = Date.now()) {
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type RemoteMessage = Omit<Message, "time"> & { createdAt: string };

/** Server timestamps are UTC; the device formats them in its own locale. */
export function mapMessage(item: RemoteMessage): Message {
  const at = Date.parse(item.createdAt);
  return {
    ...item,
    time: Number.isFinite(at) ? timeLabel(at) : "",
  };
}

export function mapChat(item: {
  id: string;
  name: string;
  avatar?: string | null;
  username?: string;
  bio?: string;
  preview: string;
  lastMessageAt?: number;
  unread: number;
  group: boolean;
  color: string;
  memberIds: string[];
  adminIds?: string[];
  muted: boolean;
  blocked: boolean;
  mediaVisibility?: "app" | "gallery";
  online: boolean;
  createdAt?: string;
}): Chat {
  return {
    id: item.id,
    name: item.name,
    avatar: item.avatar || "",
    username: item.username,
    bio: item.bio,
    preview: item.preview,
    time: item.lastMessageAt ? timeLabel(item.lastMessageAt) : "",
    lastMessageAt: item.lastMessageAt,
    unread: item.unread,
    group: item.group,
    color: item.color,
    memberIds: item.memberIds,
    adminIds: item.adminIds,
    muted: item.muted,
    blocked: item.blocked,
    mediaVisibility: item.mediaVisibility ?? "app",
    online: item.online,
    createdAt: item.createdAt,
  };
}

export function mapStory(item: {
  id: string;
  ownerId: string;
  name: string;
  avatar?: string;
  image: string | null;
  video: boolean;
  caption: string;
  seen: boolean;
  expiresAt?: number;
}): Story {
  return {
    id: item.id,
    ownerId: item.ownerId,
    name: item.name,
    avatar: item.avatar || "",
    image: item.image || "",
    video: item.video,
    caption: item.caption,
    seen: item.seen,
    expiresAt: item.expiresAt,
  };
}
