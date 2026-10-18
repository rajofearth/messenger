import type { Chat, Message } from "../../domain/data";

// Only the bundled demo groups have mock membership. An explicit empty array is authoritative.
const mockMembers: Record<string, string[]> = {
  g1: ["1", "3", "4", "5"],
  g2: ["1", "2", "6"],
  g3: ["2", "4", "5", "6"],
};

export function profileMembership(chat: Chat) {
  const mock =
    chat.memberIds === undefined && mockMembers[chat.id] !== undefined;
  const ids = [...new Set(chat.memberIds ?? mockMembers[chat.id] ?? [])];
  return { ids, mock, admins: chat.adminIds ?? (mock ? ids.slice(0, 1) : []) };
}

export function profileDate(chat: Chat, messages: Message[]) {
  const candidates = chat.createdAt
    ? [chat.createdAt]
    : messages
        .filter((message) => !message.deleted && message.createdAt)
        .map((message) => message.createdAt!)
        .sort();
  const date = candidates
    .map((value) => new Date(value))
    .find((value) => !Number.isNaN(value.getTime()));
  return date
    ? {
        label: date.toLocaleDateString(undefined, {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
        seeded: false,
      }
    : { label: "January 2026", seeded: true };
}

export function sharedLinks(messages: Message[]) {
  return messages
    .filter((message) => !message.deleted)
    .flatMap((message) => {
      const urls = message.text?.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
      return [
        ...new Set(urls.map((url) => url.replace(/[.,!?;:)\]}]+$/, ""))),
      ].map((url, index) => ({
        id: `${message.id}-${index}`,
        url,
        time: message.time,
      }));
    });
}
