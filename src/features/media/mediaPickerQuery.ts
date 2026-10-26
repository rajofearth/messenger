import { Album, AssetField, MediaType, Query } from "expo-media-library";
import type { AssetMetadata } from "expo-media-library";
import type { MediaPickerFilter } from "./mediaPickerModel";
import type { MediaPageWindow } from "./mediaPickerPaging";

export type MediaPageQuery = {
  filter: MediaPickerFilter;
  window: MediaPageWindow;
  album?: Album;
  photosOnly?: boolean;
};

/**
 * Reads one page of the media library, newest first.
 *
 * Ordering uses `MODIFICATION_TIME` before `CREATION_TIME`. On Android
 * `CREATION_TIME` is `MediaStore.DATE_TAKEN`, which is null for files copied
 * from a computer, a chat app or a backup, and SQLite sorts nulls after every
 * dated row — so a freshly added photo could sit at the very bottom of
 * "Recents" even after a relaunch. `DATE_MODIFIED` is written when the row is
 * inserted, so a new file sorts to the top. Creation time only breaks ties so
 * a page boundary is reproducible. The new Query API exposes no date-added or
 * id field, so this is the closest available sort key.
 */
export function queryMediaPage({
  filter,
  window,
  album,
  photosOnly = false,
}: MediaPageQuery): Promise<AssetMetadata[]> {
  const query = new Query()
    .orderBy({ key: AssetField.MODIFICATION_TIME, ascending: false })
    .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
    .limit(window.limit);
  if (window.mode === "cursor") {
    if (window.cursor !== null) {
      // Inclusive: rows on the boundary time are re-read and de-duplicated by
      // the caller, so a timestamp shared by many files cannot be skipped.
      query.lte(AssetField.MODIFICATION_TIME, window.cursor);
    }
  } else {
    query.offset(window.offset);
  }
  if (album) query.album(album);
  if (photosOnly || filter === "photos") query.eq(AssetField.MEDIA_TYPE, MediaType.IMAGE);
  else if (filter === "videos") query.eq(AssetField.MEDIA_TYPE, MediaType.VIDEO);
  else query.within(AssetField.MEDIA_TYPE, [MediaType.IMAGE, MediaType.VIDEO]);
  return query.exeForMetadata();
}
