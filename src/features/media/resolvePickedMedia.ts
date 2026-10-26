import { Asset, MediaType } from "expo-media-library";
import type { PickedMedia } from "./mediaPickerModel";
import { mediaMimeType } from "./mediaMimeType";

export async function resolvePickedMedia(ids: readonly string[]): Promise<PickedMedia[]> {
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
        return item;
      } catch {
        return null;
      }
    }),
  );
  return resolved.filter((item): item is PickedMedia => item !== null);
}
