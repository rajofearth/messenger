import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Message, Story } from "../domain/data";
import { convexClient } from "../services/convexClient";
import { uploadLocalFile } from "../services/remoteFiles";

export type SendAttachment = (args: {
  conversationId: string;
  clientMessageId: string;
  storageId: Id<"_storage">;
  caption?: string;
  replyToMessageId?: string;
}) => Promise<unknown>;
type CreateStory = (args: {
  storageId: Id<"_storage">;
  caption: string;
}) => Promise<Id<"stories">>;

export function attachmentErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("FILE_TOO_LARGE")) return "Choose a file up to 25 MiB.";
  if (message.includes("INVALID_MIME")) return "That file type is not supported here.";
  return "Check your connection and try again.";
}

/**
 * Uploads an attachment and asks the server to send it under the same client
 * message id. Throws on failure so the caller can mark the bubble failed and
 * keep it available for a retry.
 */
export async function sendAttachmentMessage({
  chatId,
  message,
  sendAttachment,
  onProgress,
}: {
  chatId: string;
  message: Message;
  sendAttachment: SendAttachment;
  onProgress?: (progress: number) => void;
}) {
  if (!message.uri || !message.kind) throw new Error("MISSING_ATTACHMENT");
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
      onProgress,
    },
  );
  await sendAttachment({
    conversationId: chatId,
    clientMessageId: message.id,
    storageId,
    caption: message.text,
    replyToMessageId: message.replyTo?.id,
  });
}

/**
 * Uploads one story and returns the confirmed story id. The caller owns the
 * pending row, so a failure can be retried without making the user pick again.
 */
export async function uploadAndCreateStory(
  story: Story,
  createStory: CreateStory,
  onProgress?: (progress: number) => void,
) {
  if (!story.image) throw new Error("MISSING_ATTACHMENT");
  const storageId = await uploadLocalFile(
    convexClient,
    api.files.generateUploadUrl,
    api.files.finalizeUpload,
    {
      uri: story.image,
      kind: "story",
      mimeType: story.video ? "video/mp4" : "image/jpeg",
      filename: `story-${story.id}`,
      onProgress,
    },
  );
  return await createStory({
    storageId,
    caption: story.caption,
  });
}
