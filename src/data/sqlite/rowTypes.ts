/**
 * The exact shape SQLite returns for each table this layer reads.
 *
 * Nullable columns stay nullable here: the mappers in `rows.ts` decide which
 * nulls are a missing optional field and which are a real value.
 */

export type ConversationRow = {
  id: string;
  name: string;
  avatar: string;
  preview: string;
  time: string;
  is_group: number;
  color: string;
  username: string | null;
  bio: string | null;
  created_at: string | null;
  member_ids: string | null;
  admin_ids: string | null;
  muted: number;
  blocked: number;
  pinned: number;
  media_visibility: string | null;
  last_message_at: number | null;
  unread: number;
  unread_ordinal: number;
  last_read_unread_ordinal: number;
  cleared_through: number | null;
  hidden_at: number | null;
  position: number;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  sequence: number | null;
  client_message_id: string | null;
  mine: number;
  time: string;
  text: string | null;
  kind: string | null;
  mime_type: string | null;
  filename: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  reply_to_id: string | null;
  reply_to_preview: string | null;
  reply_to_mine: number | null;
  reply_to_kind: string | null;
  forwarded: number;
  album_id: string | null;
  album_kind: string | null;
  reaction: string | null;
  status: string | null;
  deleted: number;
  created_at: string | null;
  created_at_ms: number | null;
  local_status: string | null;
  upload_progress: number | null;
  storage_id: string | null;
  uri: string | null;
  preview_uri: string | null;
  preview_width: number | null;
};

export type MessageVariantRow = {
  message_id: string;
  name: string;
  uri: string;
  width: number | null;
  height: number | null;
  mime_type: string | null;
};

export type StoryRow = {
  id: string;
  name: string;
  avatar: string;
  image: string;
  width: number | null;
  height: number | null;
  preview_uri: string | null;
  preview_width: number | null;
  mime_type: string | null;
  seen: number;
  caption: string;
  video: number;
  crop: string | null;
  owner_id: string | null;
  created_at: number | null;
  expires_at: number | null;
  upload_status: string | null;
  upload_progress: number | null;
  position: number;
};

export type CallHistoryRow = {
  id: string;
  chat: string;
  video: number;
  seconds: number;
  time: string;
  missed: number;
  position: number;
};

export type SettingsRow = {
  id: number;
  name: string;
  bio: string;
  username: string;
  haptics: number;
  avatar: string;
  sound: number;
  previews: number;
  system_notifications: number;
};
