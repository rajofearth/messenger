import { Asset, MediaType } from "expo-media-library";
import type { PickedMedia } from "./mediaPickerModel";
import { mediaMimeType } from "./mediaMimeType";
import { cachePickedMedia } from "../../services/mediaCache";

export type ResolvedPickedMedia = { id: string; media: PickedMedia };

/** Resolves each asset and keeps the id so a caller can prune missing picks. */
export async function resolvePickedMediaItems(
  ids: readonly string[],
): Promise<ResolvedPickedMedia[]> {
  const resolved = await Promise.all(
    ids.map(async (id) => {
      try {
        const info = await new Asset(id).getInfo();
        const item: PickedMedia = {
          uri: info.uri,
          video: info.mediaType === MediaType.VIDEO,
          filename: info.filename,
          mimeType: mediaMimeType(info.filename, info.mediaType === MediaType.VIDEO),
          width: info.width,
          height: info.height,
          duration: info.duration ? info.duration / 1000 : undefined,
        };
        return { id, media: await cachePickedMedia(item, `picked-${id}`) };
      } catch {
        return null;
      }
    }),
  );
  return resolved.filter(
    (item): item is ResolvedPickedMedia => item !== null,
  );
}

export async function resolvePickedMedia(ids: readonly string[]): Promise<PickedMedia[]> {
  return (await resolvePickedMediaItems(ids)).map((item) => item.media);
}
