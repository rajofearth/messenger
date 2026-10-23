const friendlyErrors: Record<string, string> = {
  AUTH_REQUIRED: "Your session expired. Sign in again.",
  BLOCKED_BY_PEER: "This person has blocked the conversation.",
  CANNOT_CHAT_WITH_SELF: "You cannot start a chat with yourself.",
  CHAT_NOT_FOUND: "That conversation no longer exists.",
  CONVERSATION_BLOCKED: "You blocked this conversation. Unblock it first.",
  FILE_EMPTY: "That file is empty.",
  FILE_FORBIDDEN: "You do not own that upload.",
  FILE_NOT_FOUND: "The upload was not found.",
  FILE_TOO_LARGE: "Files must be 25 MiB or smaller.",
  GROUP_NEEDS_MEMBERS: "Add at least one other person to the group.",
  INVALID_MIME: "That file type is not supported.",
  INVALID_NAME: "Enter a name.",
  INVALID_USERNAME:
    "Use a username with 3 to 30 letters, numbers, or underscores.",
  READ_ONLY: "You cannot write in this conversation.",
  SAME_CONVERSATION: "Choose a different conversation to forward into.",
  USERNAME_NOT_FOUND: "No account has that username.",
  USERNAME_TAKEN: "That username is already taken.",
};

export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (friendlyErrors[raw]) return friendlyErrors[raw];
  const code = Object.keys(friendlyErrors).find((item) =>
    raw.includes(item),
  );
  if (code) return friendlyErrors[code];
  return raw
    .replace(/^ConvexError:\s*/i, "")
    .replace(/^\[.*?\]\s*/, "")
    .trim();
}

export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "?";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function timeLabel(value?: number): string {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function messageTime(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}
