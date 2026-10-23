import { Album, AssetField, Query } from "expo-media-library";
import type { AssetMetadata } from "expo-media-library";

export type StoryAlbum = {
  id: string;
  title: string;
  album: Album;
  cover: AssetMetadata | null;
};

export async function loadStoryAlbums(): Promise<StoryAlbum[]> {
  const all = await Album.getAll();
  const choices = await Promise.all(
    all.map(async (album) => {
      const [title, cover] = await Promise.all([
        album.getTitle(),
        new Query()
          .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
          .limit(1)
          .album(album)
          .exeForMetadata(),
      ]);
      return { id: album.id, title, album, cover: cover[0] ?? null };
    }),
  );
  return choices.filter((item) => !!item.title);
}
