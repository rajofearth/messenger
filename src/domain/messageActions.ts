import type { Chat, Message } from "./data";

export function messagePreview(message: Message): string {
  if (message.deleted) return "Message deleted";
  const text =
    message.kind === "image"
      ? "Sent a photo"
      : message.kind === "video"
        ? "Sent a video"
        : message.kind === "audio"
          ? "Voice message"
          : message.kind === "file"
            ? message.filename || "File"
            : message.text || "";
  return message.mine ? `You: ${text}` : text;
}

export function refreshChatPreview(chat: Chat, messages: Message[]): Chat {
  const latest = messages.at(-1);
  return {
    ...chat,
    preview: latest ? messagePreview(latest) : "No messages yet",
    time: latest?.time || "",
    typing: false,
    unread: messages.length ? chat.unread : 0,
  };
}

export function deleteFromThread(
  messages: Message[],
  id: string,
  everyone: boolean,
): Message[] {
  const target = messages.find((message) => message.id === id);
  if (!target || (everyone && !target.mine)) return messages;
  if (!everyone) return messages.filter((message) => message.id !== id);
  return messages.map((message) => {
    if (message.id === id) {
      return {
        id: message.id,
        mine: message.mine,
        time: message.time,
        ...(message.createdAt !== undefined
          ? { createdAt: message.createdAt }
          : {}),
        deleted: true,
      };
    }
    if (message.replyTo?.id !== id) return message;
    return {
      ...message,
      replyTo: { id, mine: message.replyTo.mine, text: "Message deleted" },
    };
  });
}

export function createForward(
  message: Message,
  target: Chat,
  id: string,
  time: string,
  createdAt: string,
): Message | null {
  if (message.deleted || target.blocked) return null;
  const { replyTo, deleted, reaction, ...payload } = message;
  return { ...payload, id, mine: true, time, createdAt, forwarded: true };
}
