import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Message, Story } from "../domain/data";
import { convexClient } from "../services/convexClient";
import { uploadLocalFile } from "../services/remoteFiles";
import {
  discardPreparedImage,
  prepareImageVariants,
  type PreparedImage,
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

/** A failed transform leaves the original as the only upload. */
async function prepareVariants(
  uri: string,
  mimeType?: string,
): Promise<PreparedImage | undefined> {
  try {
    return await prepareImageVariants(uri, mimeType);
  } catch {
    return undefined;
  }
}

function discardVariants(prepared: PreparedImage | undefined) {
  for (const variant of prepared?.variants ?? []) {
    discardPreparedImage(variant.uri);
  }
}

function positive(value: number | undefined) {
  return value && value > 0 ? value : undefined;
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
 * Uploads an attachment and asks the server to send it under the same client
 * message id. A message that already holds a finalized storage id skips the
 * upload: retrying with the same id and parts is idempotent, while a second
 * upload would change the parts and be rejected with IDEMPOTENCY_CONFLICT.
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
    let prepared: PreparedImage | undefined;
    try {
      // A retry that already holds a finalized id points at a source whose
      // variants were attached at finalize time; preparing again would only
      // create bytes nobody references.
      if (kind === "image" && !message.storageId) {
        prepared = await prepareVariants(uri, message.mimeType);
      }
      const uploaded = await uploadLocalFile(
        convexClient,
        api.files.generateUploadUrl,
        api.files.finalizeUpload,
        {
          uri,
          kind,
          mimeType: message.mimeType,
          filename: message.filename,
          width: message.width ?? positive(prepared?.width),
          height: message.height ?? positive(prepared?.height),
          durationMs: message.duration ? message.duration * 1000 : undefined,
          variants: prepared?.variants.length
            ? prepared.variants
            : undefined,
          onProgress,
        },
      );
      await onUploaded?.(uploaded);
      return uploaded;
    } finally {
      discardVariants(prepared);
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
  let prepared: PreparedImage | undefined;
  try {
    if (!story.video) prepared = await prepareVariants(story.image, mimeType);
    const width = story.width ?? positive(prepared?.width);
    const height = story.height ?? positive(prepared?.height);
    const storageId = await uploadLocalFile(
      convexClient,
      api.files.generateUploadUrl,
      api.files.finalizeUpload,
      {
        uri: story.image,
        kind: "story",
        mimeType,
        filename: `story-${story.id}`,
        width,
        height,
        variants: prepared?.variants.length
          ? prepared.variants
          : undefined,
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
    discardVariants(prepared);
  }
}
