import { Album, AssetField, MediaType, Query } from "expo-media-library";
import type { AssetMetadata } from "expo-media-library";
import type { MediaPickerFilter } from "./mediaPickerModel";

export const MEDIA_PAGE_SIZE = 60;

export function queryMediaPage(
  filter: MediaPickerFilter,
  offset: number,
  album?: Album,
  photosOnly = false,
): Promise<AssetMetadata[]> {
  const query = new Query()
    .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
    .limit(MEDIA_PAGE_SIZE)
    .offset(offset);
  if (album) query.album(album);
  if (photosOnly || filter === "photos") query.eq(AssetField.MEDIA_TYPE, MediaType.IMAGE);
  else if (filter === "videos") query.eq(AssetField.MEDIA_TYPE, MediaType.VIDEO);
  else query.within(AssetField.MEDIA_TYPE, [MediaType.IMAGE, MediaType.VIDEO]);
  return query.exeForMetadata();
}
