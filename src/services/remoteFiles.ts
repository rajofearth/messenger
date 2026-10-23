import { File } from "expo-file-system";
import type { ConvexReactClient } from "convex/react";
import type { FunctionReference } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";

type UploadUrlMutation = FunctionReference<
  "mutation",
  "public",
  Record<string, never>,
  string
>;
type FinalizeMutation = FunctionReference<
  "mutation",
  "public",
  {
    storageId: Id<"_storage">;
    kind: "image" | "video" | "audio" | "file" | "avatar" | "story";
    mimeType: string;
    filename: string;
    size: number;
    width?: number;
    height?: number;
    durationMs?: number;
  },
  Id<"_storage"> | { error: string }
>;

/** Server-side cap; checked here too so an oversized pick fails fast. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

type UploadInput = {
  uri: string;
  kind: "image" | "video" | "audio" | "file" | "avatar" | "story";
  mimeType?: string;
  filename?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  /** Receives the upload fraction from 0 to 1 as bytes leave the device. */
  onProgress?: (progress: number) => void;
};

export async function uploadLocalFile(
  client: ConvexReactClient,
  uploadUrlMutation: UploadUrlMutation,
  finalizeMutation: FinalizeMutation,
  input: UploadInput,
) {
  const file = new File(input.uri);
  const size = file.size ?? 0;
  if (size > MAX_UPLOAD_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }
  input.onProgress?.(0);
  const uploadUrl = await client.mutation(uploadUrlMutation, {});
  const response = await file.upload(uploadUrl, {
    headers: input.mimeType ? { "Content-Type": input.mimeType } : undefined,
    onProgress: ({ bytesSent, totalBytes }) => {
      if (totalBytes > 0 && Number.isFinite(totalBytes)) {
        input.onProgress?.(Math.min(1, bytesSent / totalBytes));
      }
    },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Upload failed (${response.status})`);
  }
  const body = JSON.parse(response.body) as { storageId?: string };
  if (!body.storageId) throw new Error("Upload did not return a storage id");
  const finalized = await client.mutation(finalizeMutation, {
    storageId: body.storageId as Id<"_storage">,
    kind: input.kind,
    mimeType: input.mimeType || "application/octet-stream",
    filename: input.filename || file.name || "attachment",
    size,
    width: input.width,
    height: input.height,
    durationMs: input.durationMs,
  });
  if (typeof finalized !== "string") throw new Error(finalized.error);
  input.onProgress?.(1);
  return finalized as Id<"_storage">;
}
