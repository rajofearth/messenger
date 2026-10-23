import { Album, AssetField, Query } from "expo-media-library";
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

export async function loadMediaAlbums(): Promise<MediaAlbum[]> {
  const all = await Album.getAll();
  const choices = await Promise.all(
    all.map(async (album) => {
      const [title, cover, count] = await Promise.all([
        album.getTitle(),
        new Query()
          .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
          .limit(1)
          .album(album)
          .exeForMetadata(),
        getAssetsAsync({ album: album.id, first: 1 }),
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

export async function loadRecentMediaCount(): Promise<number> {
  const page = await getAssetsAsync({
    first: 1,
    mediaType: [LegacyMediaType.photo, LegacyMediaType.video],
  });
  return page.totalCount;
}
