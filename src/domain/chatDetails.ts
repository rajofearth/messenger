import type { Chat } from "./data";
const bios: Record<string, string> = {
  "1": "Photographs, weekend trips, and finding the next good coffee.",
  "2": "Designer. Usually outside when I’m not at my desk.",
  "3": "Music on. Notifications sometimes off.",
  "4": "Making plans and bringing the playlist.",
  "5": "Collecting moments, not things.",
  "6": "Always up for a conversation.",
  g1: "Weekend plans, places to explore, and photos from the trip.",
  g2: "A space for our projects, ideas, and studio catch-ups.",
  g3: "Our Sunday plans and everything in between.",
};
const members: Record<string, string[]> = {
  g1: ["self", "1", "2", "4"],
  g2: ["self", "2", "3", "6"],
  g3: ["self", "1", "4", "5"],
};
export function enrichChat(chat: Chat): Chat {
  if (!bios[chat.id]) return chat;
  return {
    username: chat.group
      ? undefined
      : chat.name.toLowerCase().replace(/\s+/g, "."),
    bio: bios[chat.id],
    createdAt: "2026-01-12T10:00:00.000Z",
    memberIds: members[chat.id],
    adminIds: chat.group
      ? ["self", members[chat.id]?.[1] || "self"]
      : undefined,
    ...chat,
  };
}
