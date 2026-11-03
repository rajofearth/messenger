import type { Message } from "../../domain/data";

export function messageSummary(
  message: Pick<Message, "text" | "kind" | "filename" | "deleted">,
) {
  if (message.deleted) return "Deleted message";
  return (
    message.text ||
    message.filename ||
    { image: "Photo", video: "Video", audio: "Voice note", file: "File" }[
      message.kind ?? "file"
    ]
  );
}

/** A composed TalkBack label: sender, content, context, time and send state. */
export function messageAccessibilityLabel(message: Message) {
  if (message.deleted) return "Deleted message";
  const parts: string[] = [];
  if (message.forwarded) parts.push("Forwarded");
  parts.push(`${message.mine ? "You" : "Message"}: ${messageSummary(message)}`);
  if (message.replyTo) parts.push(`Replying to ${message.replyTo.text}`);
  if (message.reaction) parts.push(`Reaction ${message.reaction}`);
  if (message.time) parts.push(message.time);
  if (message.status === "sending") parts.push("Sending");
  if (message.status === "failed") parts.push("Not sent. Tap to retry.");
  return parts.join(", ");
}

export function replySnapshot(
  message: Message,
): NonNullable<Message["replyTo"]> {
  return {
    id: message.id,
    text: messageSummary(message),
    mine: message.mine,
    ...(message.kind ? { kind: message.kind } : {}),
  };
}

export function withReply(
  message: Partial<Message>,
  reply: Message["replyTo"] | null,
): Partial<Message> {
  return { ...message, ...(reply ? { replyTo: { ...reply } } : {}) };
}

export function deleteOptions(
  message: Message,
  onDelete: (id: string, everyone: boolean) => void,
) {
  return [
    {
      text: "Delete for me",
      style: "destructive" as const,
      onPress: () => onDelete(message.id, false),
    },
    // A local-only bubble has no confirmed server row yet, so "everyone"
    // cannot work and would only surface an avoidable error.
    ...(message.mine && !message.status
      ? [
          {
            text: "Delete for everyone",
            style: "destructive" as const,
            onPress: () => onDelete(message.id, true),
          },
        ]
      : []),
    { text: "Cancel", style: "cancel" as const },
  ];
}
