import { Alert } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Chat, Message, Story } from "../domain/data";
import { convexClient } from "../services/convexClient";
import { uploadLocalFile } from "../services/remoteFiles";
import { remoteUid, timeLabel } from "./remoteMessengerTypes";

type AppendLocal = (chat: Chat, message: Message, preview: string) => void;
type SendAttachment = (args: {
  conversationId: string;
  clientMessageId: string;
  storageId: Id<"_storage">;
  caption?: string;
  replyToMessageId?: string;
}) => Promise<unknown>;
type CreateStory = (args: {
  storageId: Id<"_storage">;
  caption: string;
}) => Promise<unknown>;

function uploadErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("FILE_TOO_LARGE")) return "Choose a file up to 25 MiB.";
  if (message.includes("INVALID_MIME")) return "That file type is not supported here.";
  return "Check your connection and try again.";
}

export async function uploadAndSendAttachment(
  chat: Chat,
  message: Partial<Message>,
  appendLocal: AppendLocal,
  sendAttachment: SendAttachment,
  onFailure?: (chatId: string, messageId: string) => void,
) {
  if (!message.uri || !message.kind) return;
  const clientMessageId = remoteUid();
  appendLocal(chat, {
    ...message,
    id: clientMessageId,
    mine: true,
    time: timeLabel(),
    createdAt: new Date().toISOString(),
  }, message.filename || `Sent ${message.kind}`);
  try {
    const storageId = await uploadLocalFile(
      convexClient,
      api.files.generateUploadUrl,
      api.files.finalizeUpload,
      {
        uri: message.uri,
        kind: message.kind,
        mimeType: message.mimeType,
        filename: message.filename,
        width: message.width,
        height: message.height,
        durationMs: message.duration ? message.duration * 1000 : undefined,
      },
    );
    await sendAttachment({
      conversationId: chat.id,
      clientMessageId,
      storageId,
      caption: message.text,
      replyToMessageId: message.replyTo?.id,
    });
  } catch (error) {
    onFailure?.(chat.id, clientMessageId);
    Alert.alert("Attachment not sent", uploadErrorMessage(error));
  }
}

export async function uploadAndCreateStory(story: Story, createStory: CreateStory) {
  if (!story.image) return;
  try {
    const storageId = await uploadLocalFile(
      convexClient,
      api.files.generateUploadUrl,
      api.files.finalizeUpload,
      {
        uri: story.image,
        kind: "story",
        mimeType: story.video ? "video/mp4" : "image/jpeg",
        filename: `story-${story.id}`,
      },
    );
    await createStory({
      storageId,
      caption: story.caption,
    });
  } catch (error) {
    Alert.alert("Story not shared", uploadErrorMessage(error));
  }
}
