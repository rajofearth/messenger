import type { Chat } from "../domain/data";

/** One conversation as `api.conversations.list` projects it. */
export type RemoteConversation = {
  id: string;
  kind: "direct" | "group";
  title: string;
  createdAt: number;
  memberIds: string[];
  adminIds: string[];
  members: Array<{
    id: string;
    name: string;
    username?: string;
    avatar?: string;
    bio?: string;
  }>;
};

/** One row of `api.preferences.all`, keyed by the conversation it belongs to. */
export type RemotePreference = {
  conversationId: string;
  muted: boolean;
  blocked: boolean;
  mediaVisibility: "app" | "gallery";
  clearedThrough?: number;
  hiddenAt?: number;
};

/** The inbox colours the old server projection used, kept for the same look. */
const DIRECT_COLOR = "#EBEEE4";
const GROUP_COLOR = "#F4E4D9";

function displayName(view: RemoteConversation, selfId?: string): string {
  if (view.kind === "group") {
    return view.title || view.members.map((member) => member.name).join(", ");
  }
  const peer = view.members.find((member) => member.id !== selfId);
  return peer?.name || "Conversation";
}

function avatarOf(view: RemoteConversation, selfId?: string): string {
  if (view.kind === "group") {
    return view.members.find((member) => member.avatar)?.avatar ?? "";
  }
  const peer = view.members.find((member) => member.id !== selfId);
  return peer?.avatar ?? "";
}

/**
 * The client owns preview, time and unread now, so a server conversation only
 * contributes identity and membership. Everything the phone already knows
 * about the thread is copied from `cached`, which the relay drain keeps current.
 */
export function chatFromConversation(
  view: RemoteConversation,
  preference: RemotePreference | undefined,
  cached: Chat | undefined,
  selfId?: string,
): Chat {
  const peer =
    view.kind === "direct"
      ? view.members.find((member) => member.id !== selfId)
      : undefined;
  const cleared =
    !!preference?.clearedThrough &&
    (!cached?.lastMessageAt || cached.lastMessageAt <= preference.clearedThrough);
  return {
    id: view.id,
    name: displayName(view, selfId),
    avatar: avatarOf(view, selfId),
    username: peer?.username,
    bio: peer?.bio,
    preview: cleared
      ? "No messages yet"
      : cached?.preview || "Start a conversation",
    time: cleared ? "" : (cached?.time ?? ""),
    unread: cleared ? 0 : (cached?.unread ?? 0),
    group: view.kind === "group",
    color: view.kind === "group" ? GROUP_COLOR : DIRECT_COLOR,
    createdAt: new Date(view.createdAt).toISOString(),
    memberIds: view.memberIds,
    adminIds: view.adminIds,
    muted: preference?.muted ?? false,
    blocked: preference?.blocked ?? false,
    mediaVisibility: preference?.mediaVisibility ?? "app",
    lastMessageAt: cleared ? undefined : cached?.lastMessageAt,
    lastMessageStatus: cleared ? undefined : cached?.lastMessageStatus,
  };
}

/** Newest conversation first, which is the order the chat list renders. */
function byRecency(a: Chat, b: Chat): number {
  const left = a.lastMessageAt ?? 0;
  const right = b.lastMessageAt ?? 0;
  if (left !== right) return right - left;
  const leftCreated = a.createdAt ? Date.parse(a.createdAt) : 0;
  const rightCreated = b.createdAt ? Date.parse(b.createdAt) : 0;
  return rightCreated - leftCreated;
}

/**
 * Folds the server's conversation list over the device copy. A conversation the
 * user hid stays hidden until a newer message arrives, and a local row the
 * server has not answered for yet is kept rather than dropped mid-session.
 */
export function mergeConversations(
  views: readonly RemoteConversation[],
  preferences: readonly RemotePreference[],
  cached: readonly Chat[],
  selfId?: string,
): Chat[] {
  const cachedById = new Map(cached.map((chat) => [chat.id, chat]));
  const preferenceById = new Map(
    preferences.map((preference) => [preference.conversationId, preference]),
  );
  const known = new Set<string>();
  const merged: Chat[] = [];
  for (const view of views) {
    known.add(view.id);
    const preference = preferenceById.get(view.id);
    const chat = chatFromConversation(
      view,
      preference,
      cachedById.get(view.id),
      selfId,
    );
    if (preference?.hiddenAt && (chat.lastMessageAt ?? 0) <= preference.hiddenAt)
      continue;
    merged.push(chat);
  }
  for (const chat of cached) {
    if (!known.has(chat.id)) merged.push(chat);
  }
  return merged.sort(byRecency);
}
