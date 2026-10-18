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
    ...(message.mine
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
