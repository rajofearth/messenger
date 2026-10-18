import type { Chat } from "./data";

export function filterConversations(
  chats: Chat[],
  query: string,
  tab: "private" | "group",
): Chat[] {
  const term = query.trim().toLowerCase();
  return chats.filter((chat) =>
    term
      ? `${chat.name} ${chat.preview}`.toLowerCase().includes(term)
      : Boolean(chat.group) === (tab === "group"),
  );
}

export function unreadConversations(
  chats: Chat[],
  tab: "private" | "group",
): number {
  return chats.filter(
    (chat) => Boolean(chat.group) === (tab === "group") && chat.unread > 0,
  ).length;
}

export function formatDuration(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(total / 60)
    .toString()
    .padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
}

export function markChatRead(chats: Chat[], id: string): Chat[] {
  return chats.map((chat) => (chat.id === id ? { ...chat, unread: 0 } : chat));
}

export function updateChatPreview(
  chats: Chat[],
  update: {
    id: string;
    preview: string;
    time: string;
    mine: boolean;
    openChatId: string | null;
  },
): Chat[] {
  const found = chats.find((chat) => chat.id === update.id);
  if (!found) return chats;
  return [
    {
      ...found,
      preview: update.preview,
      time: update.time,
      typing: false,
      unread:
        update.mine || update.openChatId === update.id ? 0 : found.unread + 1,
    },
    ...chats.filter((chat) => chat.id !== update.id),
  ];
}
