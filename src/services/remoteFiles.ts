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

/** One generated width waiting to leave the device. */
export type LocalImageVariant = {
  uri: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
};

type FinalizeVariant = {
  storageId: Id<"_storage">;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
};

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
    variants?: FinalizeVariant[];
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
  /** Generated widths to upload after the main file, at most three. */
  variants?: LocalImageVariant[];
  /** Receives the upload fraction from 0 to 1 as bytes leave the device. */
  onProgress?: (progress: number) => void;
};

type UploadedBlob = {
  storageId: Id<"_storage">;
  size: number;
  name: string;
};

async function uploadBlob(
  client: ConvexReactClient,
  uploadUrlMutation: UploadUrlMutation,
  input: { uri: string; mimeType?: string },
  onProgress?: (fraction: number) => void,
): Promise<UploadedBlob> {
  const file = new File(input.uri);
  const size = file.size ?? 0;
  if (size > MAX_UPLOAD_BYTES) throw new Error("FILE_TOO_LARGE");
  const uploadUrl = await client.mutation(uploadUrlMutation, {});
  const response = await file.upload(uploadUrl, {
    headers: input.mimeType ? { "Content-Type": input.mimeType } : undefined,
    onProgress: ({ bytesSent, totalBytes }) => {
      if (totalBytes > 0 && Number.isFinite(totalBytes)) {
        onProgress?.(Math.min(1, bytesSent / totalBytes));
      }
    },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Upload failed (${response.status})`);
  }
  const body = JSON.parse(response.body) as { storageId?: string };
  if (!body.storageId) throw new Error("Upload did not return a storage id");
  return {
    storageId: body.storageId as Id<"_storage">,
    size,
    name: file.name || "attachment",
  };
}

function finalizeArgs(
  input: UploadInput,
  main: UploadedBlob,
  variants: FinalizeVariant[],
) {
  return {
    storageId: main.storageId,
    kind: input.kind,
    mimeType: input.mimeType || "application/octet-stream",
    filename: input.filename || main.name || "attachment",
    size: main.size,
    width: input.width,
    height: input.height,
    durationMs: input.durationMs,
    ...(variants.length ? { variants } : {}),
  };
}

/**
 * Uploads a file and, when present, its generated widths before finalizing
 * once with every storage id. Progress covers the whole operation: the main
 * blob is 0..0.55, the widths 0.55..0.95, and finalizing reaches 1.
 *
 * The server deletes a rejected batch, so an `INVALID_VARIANTS` answer means
 * the main blob is gone too. The recovery path uploads the original again and
 * finalizes without variants; a variant bug therefore delays a message but
 * never blocks it, and the discarded variant blobs are swept server-side.
 */
export async function uploadLocalFile(
  client: ConvexReactClient,
  uploadUrlMutation: UploadUrlMutation,
  finalizeMutation: FinalizeMutation,
  input: UploadInput,
) {
  input.onProgress?.(0);
  const main = await uploadBlob(
    client,
    uploadUrlMutation,
    { uri: input.uri, mimeType: input.mimeType },
    (fraction) => input.onProgress?.(fraction * 0.55),
  );

  const variants = input.variants ?? [];
  const variantArgs: FinalizeVariant[] = [];
  for (const [index, variant] of variants.entries()) {
    const uploaded = await uploadBlob(
      client,
      uploadUrlMutation,
      { uri: variant.uri, mimeType: variant.mimeType },
      (fraction) =>
        input.onProgress?.(
          0.55 + (0.4 * (index + fraction)) / Math.max(variants.length, 1),
        ),
    );
    variantArgs.push({
      storageId: uploaded.storageId,
      name: variant.name,
      mimeType: variant.mimeType,
      width: variant.width,
      height: variant.height,
      bytes: variant.bytes,
    });
  }

  let finalized = await client.mutation(
    finalizeMutation,
    finalizeArgs(input, main, variantArgs),
  );
  if (
    typeof finalized !== "string" &&
    finalized.error === "INVALID_VARIANTS" &&
    variantArgs.length > 0
  ) {
    const retried = await uploadBlob(
      client,
      uploadUrlMutation,
      { uri: input.uri, mimeType: input.mimeType },
      (fraction) => input.onProgress?.(0.95 + fraction * 0.04),
    );
    finalized = await client.mutation(
      finalizeMutation,
      finalizeArgs(input, retried, []),
    );
  }
  if (typeof finalized !== "string") throw new Error(finalized.error);
  input.onProgress?.(1);
  return finalized;
}
