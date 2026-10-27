import { Album, AssetField, MediaType, Query } from "expo-media-library";
import type { AssetMetadata } from "expo-media-library";
import { getAssetsAsync, MediaType as LegacyMediaType } from "expo-media-library/legacy";
import { filterNonEmptyAlbums } from "./mediaPickerModel";

export type MediaAlbum = {
  id: string;
  title: string;
  album: Album;
  cover: AssetMetadata | null;
  count: number;
};

/**
 * Cover and count must describe the same media the grid will show. The legacy
 * `getAssetsAsync` defaults to photos only, which made an album of 85 files
 * read as 83 once it also contained two videos, and hid video-only albums
 * completely. Callers pass `photosOnly` for the profile-photo flow.
 */
function mediaTypes(photosOnly: boolean) {
  return photosOnly
    ? [LegacyMediaType.photo]
    : [LegacyMediaType.photo, LegacyMediaType.video];
}

/** Newest first, using the same order as the grid. */
function newestQuery() {
  return new Query()
    .orderBy({ key: AssetField.MODIFICATION_TIME, ascending: false })
    .orderBy({ key: AssetField.CREATION_TIME, ascending: false });
}

export async function loadMediaAlbums(photosOnly = false): Promise<MediaAlbum[]> {
  const types = mediaTypes(photosOnly);
  const all = await Album.getAll();
  const choices = await Promise.all(
    all.map(async (album) => {
      const coverQuery = newestQuery().limit(1).album(album);
      if (photosOnly) coverQuery.eq(AssetField.MEDIA_TYPE, MediaType.IMAGE);
      const [title, cover, count] = await Promise.all([
        album.getTitle(),
        coverQuery.exeForMetadata(),
        getAssetsAsync({ album: album.id, first: 1, mediaType: types }),
      ]);
      return {
        id: album.id,
        title,
        album,
        cover: cover[0] ?? null,
        count: count.totalCount,
      };
    }),
  );
  return filterNonEmptyAlbums(choices.filter((item) => !!item.title));
}

export async function loadRecentMediaCount(photosOnly = false): Promise<number> {
  const page = await getAssetsAsync({
    first: 1,
    mediaType: mediaTypes(photosOnly),
  });
  return page.totalCount;
}
