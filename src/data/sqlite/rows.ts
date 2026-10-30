/**
 * Row shapes and the pure mapping between them and the domain types.
 *
 * Reads still re-check enum values instead of casting, so a value the domain
 * does not know becomes `undefined` instead of reaching a screen. Writes only
 * ever store values the domain types allow.
 */

import type {
  Chat,
  ImageVariant,
  Message,
  MessageStatus,
  Story,
  StoryUploadStatus,
} from "../../domain/data";
import type {
  CallHistoryRecord,
  ChatRecord,
  MessageRecord,
  SettingsRecord,
  StoryRecord,
} from "../records";
import type { SqlValue } from "./types";
import type {
  CallHistoryRow,
  ConversationRow,
  MessageRow,
  MessageVariantRow,
  SettingsRow,
  StoryRow,
} from "./rowTypes";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const finite = (value: number | null | undefined): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export function messageKind(value: string | null): Message["kind"] | undefined {
  return value === "image" || value === "video" || value === "audio" || value === "file"
    ? value
    : undefined;
}
export function messageStatus(value: string | null): MessageStatus | undefined {
  return value === "sending" || value === "sent" || value === "failed"
    ? value
    : undefined;
}

function storyStatus(
  value: string | null | undefined,
): StoryUploadStatus | undefined {
  return value === "uploading" || value === "uploaded" || value === "failed"
    ? value
    : undefined;
}

function crop(value: string | null): Story["crop"] {
  return value === "fit" || value === "fill" ? value : undefined;
}

function mediaVisibility(value: string | null): Chat["mediaVisibility"] {
  return value === "app" || value === "gallery" ? value : undefined;
}

export function parseStringArray(value: string | null): string[] | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : undefined;
  } catch {
    return undefined;
  }
}

function stringArray(value: readonly string[] | undefined): string | null {
  return value ? JSON.stringify(value) : null;
}

function boolean(value: number): boolean {
  return value === 1;
}

export function chatFromRow(row: ConversationRow): ChatRecord {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    preview: row.preview,
    time: row.time,
    unread: row.unread,
    group: boolean(row.is_group),
    color: row.color,
    username: row.username ?? undefined,
    bio: row.bio ?? undefined,
    createdAt: row.created_at ?? undefined,
    memberIds: parseStringArray(row.member_ids),
    adminIds: parseStringArray(row.admin_ids),
    muted: boolean(row.muted),
    blocked: boolean(row.blocked),
    pinned: boolean(row.pinned),
    mediaVisibility: mediaVisibility(row.media_visibility),
    lastMessageAt: row.last_message_at ?? undefined,
  };
}

export function chatParams(
  chat: ChatRecord,
  position: number,
  unreadOrdinal: number,
): SqlValue[] {
  return [
    chat.id,
    chat.name ?? "",
    chat.avatar ?? "",
    chat.preview ?? "",
    chat.time ?? "",
    chat.group ? 1 : 0,
    chat.color ?? "",
    chat.username ?? null,
    chat.bio ?? null,
    chat.createdAt ?? null,
    stringArray(chat.memberIds),
    stringArray(chat.adminIds),
    chat.muted ? 1 : 0,
    chat.blocked ? 1 : 0,
    chat.pinned ? 1 : 0,
    mediaVisibilityValue(chat.mediaVisibility),
    finite(chat.lastMessageAt) ?? null,
    finite(chat.unread) ?? 0,
    unreadOrdinal,
    position,
  ];
}

export function mediaVisibilityValue(
  value: Chat["mediaVisibility"],
): SqlValue {
  return value === "app" || value === "gallery" ? value : null;
}

function messageStatusValue(value: MessageStatus | undefined): SqlValue {
  return value ?? null;
}

export function messageFromRow(
  row: MessageRow,
  variants: readonly ImageVariant[] = [],
): MessageRecord {
  const replyTo =
    row.reply_to_id !== null
      ? {
          id: row.reply_to_id,
          text: row.reply_to_preview ?? "",
          mine: boolean(row.reply_to_mine ?? 0),
          kind: messageKind(row.reply_to_kind),
        }
      : undefined;
  return {
    id: row.id,
    text: row.text ?? undefined,
    mine: boolean(row.mine),
    time: row.time,
    kind: messageKind(row.kind),
    replyTo,
    forwarded: row.forwarded ? true : undefined,
    deleted: row.deleted ? true : undefined,
    createdAt: row.created_at ?? undefined,
    albumId: row.album_id ?? undefined,
    mimeType: row.mime_type ?? undefined,
    width: finite(row.width),
    height: finite(row.height),
    uri: row.uri ?? undefined,
    variants: variants.length ? [...variants] : undefined,
    previewUri: row.preview_uri ?? undefined,
    previewWidth: finite(row.preview_width),
    filename: row.filename ?? undefined,
    duration: finite(row.duration),
    reaction: row.reaction ?? undefined,
    sequence: row.sequence ?? undefined,
    // A confirmed server row never carries a delivery state.
    status:
      row.sequence === null
        ? (messageStatus(row.local_status) ?? messageStatus(row.status))
        : undefined,
    uploadProgress: finite(row.upload_progress),
    storageId: row.storage_id ?? undefined,
  };
}

/** The order must match `MESSAGE_COLUMNS` in `columns.ts`. */
export function messageParams(
  conversationId: string,
  message: MessageRecord,
): SqlValue[] {
  const pending = message.sequence === undefined;
  const localStatus = pending
    ? (messageStatusValue(message.status) ?? "sending")
    : null;
  const createdAtMs =
    typeof message.createdAt === "string" ? Date.parse(message.createdAt) : NaN;
  return [
    message.id,
    conversationId,
    finite(message.sequence) ?? null,
    pending ? message.id : null,
    message.mine ? 1 : 0,
    message.time ?? "",
    message.text ?? null,
    messageKindValue(message.kind),
    message.mimeType ?? null,
    message.filename ?? null,
    finite(message.width) ?? null,
    finite(message.height) ?? null,
    finite(message.duration) ?? null,
    message.replyTo?.id ?? null,
    message.replyTo?.text ?? null,
    message.replyTo ? (message.replyTo.mine ? 1 : 0) : null,
    messageKindValue(message.replyTo?.kind),
    message.forwarded ? 1 : 0,
    message.albumId ?? null,
    null,
    message.reaction ?? null,
    messageStatusValue(message.status),
    message.deleted ? 1 : 0,
    message.createdAt ?? null,
    Number.isFinite(createdAtMs) ? createdAtMs : null,
    localStatus,
    finite(message.uploadProgress) ?? null,
    message.storageId ?? null,
    message.uri ?? null,
    message.previewUri ?? null,
    finite(message.previewWidth) ?? null,
  ];
}

function messageKindValue(value: Message["kind"]): SqlValue {
  return messageKind(value ?? null) ?? null;
}

export function variantFromRow(row: MessageVariantRow): ImageVariant | undefined {
  const width = finite(row.width);
  const height = finite(row.height);
  if (width === undefined || height === undefined) return undefined;
  return {
    name: row.name,
    uri: row.uri,
    width,
    height,
    mimeType: row.mime_type ?? undefined,
  };
}

export function messageVariantParams(
  messageId: string,
  variant: ImageVariant,
): SqlValue[] {
  return [
    messageId,
    variant.name,
    variant.uri,
    finite(variant.width) ?? 0,
    finite(variant.height) ?? 0,
    variant.mimeType ?? null,
  ];
}

export function storyFromRow(
  row: StoryRow,
  variants: readonly ImageVariant[] = [],
): StoryRecord {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    image: row.image,
    variants: variants.length ? [...variants] : undefined,
    width: finite(row.width),
    height: finite(row.height),
    previewUri: row.preview_uri ?? undefined,
    previewWidth: finite(row.preview_width),
    mimeType: row.mime_type ?? undefined,
    seen: boolean(row.seen),
    caption: row.caption,
    video: row.video ? true : undefined,
    crop: crop(row.crop),
    ownerId: row.owner_id ?? undefined,
    createdAt: finite(row.created_at),
    expiresAt: finite(row.expires_at),
    uploadStatus: storyStatus(row.upload_status),
    uploadProgress: finite(row.upload_progress),
  };
}

export function storyParams(
  story: StoryRecord,
  position: number,
): SqlValue[] {
  return [
    story.id,
    story.name ?? "",
    story.avatar ?? "",
    story.image ?? "",
    finite(story.width) ?? null,
    finite(story.height) ?? null,
    story.previewUri ?? null,
    finite(story.previewWidth) ?? null,
    story.mimeType ?? null,
    story.seen ? 1 : 0,
    story.caption ?? "",
    story.video ? 1 : 0,
    crop(story.crop ?? null) ?? null,
    story.ownerId ?? null,
    finite(story.createdAt) ?? null,
    finite(story.expiresAt) ?? null,
    storyStatus(story.uploadStatus) ?? null,
    finite(story.uploadProgress) ?? null,
    position,
  ];
}

export function callHistoryFromRow(
  row: CallHistoryRow,
): CallHistoryRecord | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.chat);
  } catch {
    return undefined;
  }
  const chat = chatFromSnapshot(parsed);
  if (!chat) return undefined;
  return {
    id: row.id,
    chat,
    video: boolean(row.video),
    seconds: finite(row.seconds) ?? 0,
    time: row.time,
    missed: boolean(row.missed),
  };
}

/**
 * A contact snapshot stored as JSON. The blob is untrusted input on the way
 * back, so every optional value is re-checked instead of cast.
 */
export function chatFromSnapshot(value: unknown): ChatRecord | undefined {
  if (!isRecord(value) || typeof value.id !== "string") return undefined;
  return {
    id: value.id,
    name: typeof value.name === "string" ? value.name : "",
    avatar: typeof value.avatar === "string" ? value.avatar : "",
    preview: typeof value.preview === "string" ? value.preview : "",
    time: typeof value.time === "string" ? value.time : "",
    unread: typeof value.unread === "number" ? value.unread : 0,
    color: typeof value.color === "string" ? value.color : "",
    group: value.group === true,
    username: typeof value.username === "string" ? value.username : undefined,
    bio: typeof value.bio === "string" ? value.bio : undefined,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : undefined,
    memberIds: Array.isArray(value.memberIds)
      ? value.memberIds.filter(
          (item): item is string => typeof item === "string",
        )
      : undefined,
    adminIds: Array.isArray(value.adminIds)
      ? value.adminIds.filter((item): item is string => typeof item === "string")
      : undefined,
    muted: value.muted === true,
    blocked: value.blocked === true,
    pinned: value.pinned === true,
    mediaVisibility: mediaVisibility(
      typeof value.mediaVisibility === "string" ? value.mediaVisibility : null,
    ),
    lastMessageAt:
      typeof value.lastMessageAt === "number" ? value.lastMessageAt : undefined,
  };
}

export function callHistoryParams(
  record: CallHistoryRecord,
  position: number,
): SqlValue[] {
  return [
    record.id,
    JSON.stringify(record.chat),
    record.video ? 1 : 0,
    finite(record.seconds) ?? 0,
    record.time ?? "",
    record.missed ? 1 : 0,
    position,
  ];
}

export function settingsFromRow(row: SettingsRow): SettingsRecord {
  return {
    name: row.name,
    bio: row.bio,
    username: row.username,
    haptics: boolean(row.haptics),
    avatar: row.avatar,
    sound: boolean(row.sound),
    previews: boolean(row.previews),
    systemNotifications: boolean(row.system_notifications),
  };
}

export function settingsParams(settings: SettingsRecord): SqlValue[] {
  return [
    settings.name ?? "",
    settings.bio ?? "",
    settings.username ?? "",
    settings.haptics ? 1 : 0,
    settings.avatar ?? "",
    settings.sound ? 1 : 0,
    settings.previews ? 1 : 0,
    settings.systemNotifications ? 1 : 0,
  ];
}
