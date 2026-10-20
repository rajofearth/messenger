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
};

export type Story = {
  id: string;
  name: string;
  avatar: string;
  image: string;
  seen: boolean;
  caption: string;
  video?: boolean;
  ownerId?: string;
  /** Unix milliseconds; a story disappears after 24 hours. */
  expiresAt?: number;
};
