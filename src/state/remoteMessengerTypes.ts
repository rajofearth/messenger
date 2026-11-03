import type { Chat, ImageVariant, Message, Story } from "../domain/data";
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

export function mapStory(item: {
  id: string;
  ownerId: string;
  name: string;
  avatar?: string;
  image: string | null;
  variants?: ImageVariant[];
  width?: number;
  height?: number;
  video: boolean;
  caption: string;
  crop?: "fit" | "fill";
  seen: boolean;
  createdAt?: number;
  expiresAt?: number;
}): Story {
  return {
    id: item.id,
    ownerId: item.ownerId,
    name: item.name,
    avatar: item.avatar || "",
    image: item.image || "",
    variants: item.variants,
    width: item.width,
    height: item.height,
    video: item.video,
    caption: item.caption,
    crop: item.crop,
    seen: item.seen,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt,
  };
}
