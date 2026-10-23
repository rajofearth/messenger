/** Delivery state for a message this device sent. Server rows omit it. */
export type MessageStatus = "sending" | "sent" | "failed";

export type Message = {
  id: string;
  text?: string;
  mine: boolean;
  time: string;
  kind?: "image" | "video" | "audio" | "file";
  replyTo?: {
    id: string;
    text: string;
    mine: boolean;
    kind?: "image" | "video" | "audio" | "file";
  };
  forwarded?: boolean;
  deleted?: boolean;
  createdAt?: string;
  albumId?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  uri?: string;
  filename?: string;
  duration?: number;
  reaction?: string;
  sequence?: number;
  revision?: number;
  /** Local-only delivery state; confirmed server rows leave it undefined. */
  status?: MessageStatus;
  /** Local-only upload fraction (0..1) while an attachment is on its way. */
  uploadProgress?: number;
};

export type Chat = {
  id: string;
  name: string;
  avatar: string;
  preview: string;
  time: string;
  unread: number;
  online?: boolean;
  typing?: boolean;
  group?: boolean;
  color: string;
  username?: string;
  bio?: string;
  createdAt?: string;
  memberIds?: string[];
  adminIds?: string[];
  muted?: boolean;
  blocked?: boolean;
  pinned?: boolean;
  /** "gallery" also copies received media into the device photo library. */
  mediaVisibility?: "app" | "gallery";
  /** Unix milliseconds of the last message, used to reconcile local sends. */
  lastMessageAt?: number;
  /** Delivery state of the last message when this device sent it. */
  lastMessageStatus?: MessageStatus;
};

export type StoryUploadStatus = "uploading" | "uploaded" | "failed";

export type Story = {
  id: string;
  name: string;
  avatar: string;
  image: string;
  seen: boolean;
  caption: string;
  video?: boolean;
  ownerId?: string;
  /** Unix milliseconds; used for the "Posted" time in the viewer. */
  createdAt?: number;
  /** Unix milliseconds; a story disappears after 24 hours. */
  expiresAt?: number;
  /** Local-only upload state for an item that is still on this device. */
  uploadStatus?: StoryUploadStatus;
  /** Local-only upload fraction (0..1) while `uploadStatus` is uploading. */
  uploadProgress?: number;
};

/** Someone who opened one of the current user's stories. */
export type StoryView = {
  id: string;
  name: string;
  avatar?: string;
  /** Unix milliseconds when they last opened the story. */
  seenAt: number;
};
