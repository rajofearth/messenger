import { File } from "expo-file-system";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Message, Story } from "../domain/data";
import { convexClient } from "../services/convexClient";
import {
  RELAY_MEDIA_LIMIT_BYTES,
} from "../services/relayConfig";
import { uploadLocalFile } from "../services/remoteFiles";
import {
  PHOTO_MAX_WIDTH,
  PHOTO_QUALITY,
  STORY_MAX_WIDTH,
  STORY_QUALITY,
  discardPreparedPhoto,
  preparePhotoUpload,
  type PreparedPhotoUpload,
} from "../services/imageVariants";
import type { RemoteMessage } from "./remoteMessengerTypes";

export type SendAttachment = (args: {
  conversationId: string;
  clientMessageId: string;
  storageId: Id<"_storage">;
  caption?: string;
  replyToMessageId?: string;
}) => Promise<RemoteMessage>;
type CreateStory = (args: {
  storageId: Id<"_storage">;
  caption: string;
  crop?: "fit" | "fill";
  width?: number;
  height?: number;
}) => Promise<Id<"stories">>;

function positive(value: number | undefined) {
  return value && value > 0 ? value : undefined;
}

function fileBytes(uri: string) {
  try {
    return new File(uri).size ?? 0;
  } catch {
    return 0;
  }
}

/**
 * The relay queue costs bytes until delivery, so refuse an oversized blob
 * before the send. The check runs on the prepared copy, not the picked file:
 * a 5 MB camera photo becomes a few hundred KB before this is reached.
 */
function refuseRelayOversize(bytes: number) {
  if (bytes > RELAY_MEDIA_LIMIT_BYTES) {
    throw new Error("QUEUE_MEDIA_TOO_LARGE");
  }
}

export function attachmentErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("FILE_TOO_LARGE")) return "Choose a file up to 25 MiB.";
  if (message.includes("INVALID_MIME")) return "That file type is not supported here.";
  if (message.includes("MISSING_ATTACHMENT")) {
    return "That file is no longer available. Pick it again.";
  }
  return "Check your connection and try again.";
}

/**
 * Uploads an attachment and asks the relay to send it under the same client
 * message id. A message that already holds a finalized storage id skips the
 * upload: retrying with the same id and parts is idempotent, while a second
 * upload would leave a second blob for the relay to release later.
 * Throws on failure so the caller can mark the bubble failed and keep it for a
 * retry. Returns the server's confirmed view of the message.
 */
export async function sendAttachmentMessage({
  chatId,
  message,
  sendAttachment,
  onProgress,
  onUploaded,
}: {
  chatId: string;
  message: Message;
  sendAttachment: SendAttachment;
  onProgress?: (progress: number) => void;
  /** Called after finalize, before the send mutation, so the id can persist. */
  onUploaded?: (storageId: string) => void | Promise<void>;
}) {
  const { uri, kind } = message;
  if (!uri || !kind) throw new Error("MISSING_ATTACHMENT");
  const upload = async () => {
    let photo: PreparedPhotoUpload | undefined;
    try {
      // A retry that already holds a finalized id points at a source whose
      // variants were attached at finalize time; preparing again would only
      // create bytes nobody references.
      if (kind === "image" && !message.storageId) {
        photo = await preparePhotoUpload(uri, message.mimeType, {
          maxWidth: PHOTO_MAX_WIDTH,
          quality: PHOTO_QUALITY,
          filename: message.filename,
        });
      }
      const uploadUri = photo?.uri ?? uri;
      const bytes = photo?.bytes ?? fileBytes(uri);
      refuseRelayOversize(bytes);
      const uploaded = await uploadLocalFile(
        convexClient,
        api.files.generateUploadUrl,
        api.files.finalizeUpload,
        {
          uri: uploadUri,
          kind,
          mimeType: photo?.mimeType ?? message.mimeType,
          filename: photo?.filename ?? message.filename,
          width: positive(photo?.width) ?? message.width,
          height: positive(photo?.height) ?? message.height,
          durationMs: message.duration ? message.duration * 1000 : undefined,
          variants: photo?.variants.length ? photo.variants : undefined,
          onProgress,
        },
      );
      await onUploaded?.(uploaded);
      return uploaded;
    } finally {
      discardPreparedPhoto(photo);
    }
  };
  const send = (storageId: Id<"_storage">) =>
    sendAttachment({
      conversationId: chatId,
      clientMessageId: message.id,
      storageId,
      caption: message.text,
      replyToMessageId: message.replyTo?.id,
    });

  let storageId = message.storageId as Id<"_storage"> | undefined;
  if (storageId) {
    // The bytes are already finalized; only the send mutation remains.
    onProgress?.(1);
  } else {
    storageId = await upload();
  }
  try {
    return await send(storageId);
  } catch (error) {
    // A finalized blob can disappear server-side; the stored id is then
    // rejected forever. Upload the durable copy again and retry once. Any
    // other failure (idempotency conflict, network) must keep its error.
    if (!message.storageId || !String(error).includes("FILE_FORBIDDEN")) {
      throw error;
    }
    return await send(await upload());
  }
}

/**
 * Uploads one story and returns the confirmed story id. The caller owns the
 * pending row, so a failure can be retried without making the user pick again.
 * Photos are re-encoded before they leave the phone: a 4096px camera JPEG is
 * several megabytes, and the same story at 1600px WebP is a fraction of that.
 * Video is uploaded as picked; the device has no transcoder.
 */
export async function uploadAndCreateStory(
  story: Story,
  createStory: CreateStory,
  onProgress?: (progress: number) => void,
) {
  if (!story.image) throw new Error("MISSING_ATTACHMENT");
  // Video stories keep a single stored file; only a photo gets stored widths.
  // Keep the picked file's real type: mislabelling a GIF as JPEG would flatten
  // its animation into static variants.
  const mimeType =
    story.mimeType ?? (story.video ? "video/mp4" : "image/jpeg");
  let photo: PreparedPhotoUpload | undefined;
  try {
    if (!story.video) {
      photo = await preparePhotoUpload(story.image, mimeType, {
        maxWidth: STORY_MAX_WIDTH,
        quality: STORY_QUALITY,
        filename: `story-${story.id}`,
      });
    }
    const width = positive(photo?.width) ?? story.width;
    const height = positive(photo?.height) ?? story.height;
    const storageId = await uploadLocalFile(
      convexClient,
      api.files.generateUploadUrl,
      api.files.finalizeUpload,
      {
        uri: photo?.uri ?? story.image,
        kind: "story",
        mimeType: photo?.mimeType ?? mimeType,
        filename: photo?.filename ?? `story-${story.id}`,
        width,
        height,
        variants: photo?.variants.length ? photo.variants : undefined,
        onProgress,
      },
    );
    return await createStory({
      storageId,
      caption: story.caption,
      crop: story.crop,
      width,
      height,
    });
  } finally {
    discardPreparedPhoto(photo);
  }
}
