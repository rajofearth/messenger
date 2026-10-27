import React from "react";
import { AppState, Linking } from "react-native";
import {
  addListener,
  getPermissionsAsync,
  presentPermissionsPicker,
  requestPermissionsAsync,
} from "expo-media-library";
import type {
  AssetMetadata,
  GranularPermission,
  MediaTypeFilter,
} from "expo-media-library";
import type { MediaPickerFilter } from "./mediaPickerModel";
import type { MediaPickerAccess } from "./MediaPickerGrid";
import {
  MEDIA_PAGE_SIZE,
  mergeMediaPage,
  nextMediaPageWindow,
} from "./mediaPickerPaging";
import { queryMediaPage } from "./mediaPickerQuery";
import { loadMediaAlbums, loadRecentMediaCount, type MediaAlbum } from "./mediaAlbums";

const GRANULAR_PERMISSIONS: GranularPermission[] = ["photo", "video"];
const MEDIA_FILTERS: MediaTypeFilter[] = ["photo", "video"];
/** A capture or import often emits several MediaStore changes in a burst. */
const MEDIA_LIBRARY_CHANGE_DELAY_MS = 400;
/** Opening the sheet refetches counts and covers unless they are this fresh. */
const ALBUM_REFRESH_AFTER_MS = 1500;

export type MediaPickerLibrary = {
  access: MediaPickerAccess;
  limited: boolean;
  assets: AssetMetadata[];
  albums: MediaAlbum[];
  recentCount?: number;
  filter: MediaPickerFilter;
  albumId: string | null;
  currentAlbumTitle: string;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  refreshingAlbums: boolean;
  checkAccess: (prompt: boolean) => Promise<void>;
  manageAccess: () => Promise<void>;
  refresh: () => void;
  refreshAlbums: () => void;
  refreshAlbumsIfStale: () => void;
  selectFilter: (filter: MediaPickerFilter) => void;
  selectAlbum: (id: string | null) => void;
  loadMore: () => void;
};

/**
 * Owns the device-library side of the picker: permission state, the paged
 * asset list, album rows and every refresh trigger.
 *
 * expo-media-library cannot stream a live query, but its Android module does
 * publish MediaStore insert/delete events through `addListener`, so the list
 * refreshes while it is open without polling. The first page is also re-read
 * on mount, on filter/album changes, on foreground and on pull-to-refresh.
 */
export function useMediaPickerLibrary({ photosOnly }: { photosOnly: boolean }): MediaPickerLibrary {
  const [access, setAccess] = React.useState<MediaPickerAccess>("checking");
  const [limited, setLimited] = React.useState(false);
  const [assets, setAssets] = React.useState<AssetMetadata[]>([]);
  const [albums, setAlbums] = React.useState<MediaAlbum[]>([]);
  const [recentCount, setRecentCount] = React.useState<number>();
  const [albumId, setAlbumId] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<MediaPickerFilter>("recents");
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [albumsKey, setAlbumsKey] = React.useState(0);
  const [refreshingAlbums, setRefreshingAlbums] = React.useState(false);
  const alive = React.useRef(true);
  const request = React.useRef(0);
  const albumsRequest = React.useRef(0);
  const assetsRef = React.useRef<AssetMetadata[]>([]);
  const albumsRef = React.useRef<MediaAlbum[]>([]);
  const albumsLoadedAt = React.useRef(0);
  const filterRef = React.useRef<MediaPickerFilter>("recents");
  const albumIdRef = React.useRef<string | null>(null);
  const loadingRef = React.useRef(false);
  const loadingMoreRef = React.useRef(false);
  const currentAlbumTitle =
    albums.find((item) => item.id === albumId)?.title || "Recents";
  const checkAccess = React.useCallback(async (prompt: boolean) => {
    const granular: GranularPermission[] = photosOnly ? ["photo"] : GRANULAR_PERMISSIONS;
    try {
      let response = await getPermissionsAsync(false, granular);
      if (!response.granted && prompt) {
        response = await requestPermissionsAsync(false, granular);
      }
      if (!alive.current) return;
      if (response.granted) {
        setLimited(response.accessPrivileges === "limited");
        setAccess("ready");
      } else {
        setLimited(false);
        setAccess("denied");
      }
    } catch {
      if (alive.current) setAccess("denied");
    }
  }, [photosOnly]);
  React.useEffect(() => {
    alive.current = true;
    void checkAccess(true);
    return () => {
      alive.current = false;
      request.current += 1;
      albumsRequest.current += 1;
    };
  }, [checkAccess]);
  React.useEffect(() => {
    if (access !== "ready") return;
    const token = ++albumsRequest.current;
    setRefreshingAlbums(true);
    void Promise.all([
      loadMediaAlbums(photosOnly),
      loadRecentMediaCount(photosOnly),
    ])
      .then(([items, count]) => {
        if (!alive.current || token !== albumsRequest.current) return;
        albumsRef.current = items;
        albumsLoadedAt.current = Date.now();
        setAlbums(items);
        setRecentCount(count);
      })
      .catch(() => {
        if (!alive.current || token !== albumsRequest.current) return;
        // Keep the last good album list when a background refresh fails.
        if (!albumsRef.current.length) {
          setAlbums([]);
          setRecentCount(undefined);
        }
      })
      .finally(() => {
        if (alive.current && token === albumsRequest.current) {
          setRefreshingAlbums(false);
        }
      });
  }, [access, photosOnly, reloadKey, albumsKey]);
  // A fresh first page is read on mount, on every filter/album change, when
  // the app returns to the foreground, after the user edits media permissions
  // and whenever the media store reports an insertion or deletion. The reset
  // is the whole point: a continuation request must never be appended to a
  // list that was read before the store changed.
  React.useEffect(() => {
    if (access !== "ready") return;
    const token = ++request.current;
    loadingRef.current = true;
    loadingMoreRef.current = false;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setHasMore(true);
    const album = albumIdRef.current
      ? albumsRef.current.find((item) => item.id === albumIdRef.current)?.album
      : undefined;
    void queryMediaPage({
      filter,
      album,
      photosOnly,
      window: nextMediaPageWindow([]),
    })
      .then((page) => {
        if (!alive.current || token !== request.current) return;
        const merged = mergeMediaPage([], page);
        assetsRef.current = merged.assets;
        setAssets(merged.assets);
        setHasMore(merged.hasMore);
      })
      .catch((cause) => {
        if (!alive.current || token !== request.current) return;
        setHasMore(false);
        // A failed background refresh must not replace a usable grid with an
        // error screen; the previous page stays visible.
        if (!assetsRef.current.length) {
          setError(
            cause instanceof Error
              ? cause.message
              : "The photo library could not be read.",
          );
        }
      })
      .finally(() => {
        if (!alive.current || token !== request.current) return;
        loadingRef.current = false;
        setLoading(false);
      });
  }, [access, filter, photosOnly, albumId, reloadKey]);
  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      // Permissions can change while the app is in the background; refresh
      // both the access state and the first page when it returns.
      void checkAccess(false).finally(() => {
        if (alive.current) setReloadKey((value) => value + 1);
      });
    });
    return () => subscription.remove();
  }, [checkAccess]);
  // MediaStore insert/delete notifications arrive on Android through the
  // media-library event. Debounce the burst a camera save or import produces
  // into one refresh; no polling and no battery cost.
  React.useEffect(() => {
    if (access !== "ready") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const subscription = addListener(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          if (alive.current) setReloadKey((value) => value + 1);
        }, MEDIA_LIBRARY_CHANGE_DELAY_MS);
      });
      return () => {
        if (timer) clearTimeout(timer);
        subscription.remove();
      };
    } catch {
      // The event is unavailable on some platforms; foreground refresh and
      // pull-to-refresh still apply.
      return undefined;
    }
  }, [access]);
  function refresh() {
    if (access !== "ready") return;
    setReloadKey((value) => value + 1);
  }
  function refreshAlbums() {
    setAlbumsKey((value) => value + 1);
  }
  function refreshAlbumsIfStale() {
    if (Date.now() - albumsLoadedAt.current > ALBUM_REFRESH_AFTER_MS) {
      refreshAlbums();
    }
  }
  async function manageAccess() {
    try {
      await presentPermissionsPicker(photosOnly ? ["photo"] : MEDIA_FILTERS);
      await checkAccess(false);
      if (alive.current) setReloadKey((value) => value + 1);
    } catch {
      // The system picker is unavailable below Android 14; settings still are.
      void Linking.openSettings();
    }
  }
  function selectFilter(next: MediaPickerFilter) {
    if (next === filterRef.current) return;
    filterRef.current = next;
    // Show the new filter from an empty grid rather than the old filter's
    // assets while its first page loads.
    assetsRef.current = [];
    setAssets([]);
    setError(null);
    setFilter(next);
  }
  function selectAlbum(id: string | null) {
    if (id === albumIdRef.current) return;
    albumIdRef.current = id;
    assetsRef.current = [];
    setAssets([]);
    setError(null);
    setAlbumId(id);
  }
  function loadMore() {
    if (access !== "ready" || loadingRef.current || loadingMoreRef.current) return;
    if (!hasMore || error) return;
    const loaded = assetsRef.current;
    if (!loaded.length) return;
    const token = request.current;
    const album = albumIdRef.current
      ? albumsRef.current.find((item) => item.id === albumIdRef.current)?.album
      : undefined;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    void (async () => {
      try {
        const window = nextMediaPageWindow(loaded);
        let merged = mergeMediaPage(
          loaded,
          await queryMediaPage({ filter, album, photosOnly, window }),
        );
        if (!merged.added && window.mode === "cursor") {
          // Every dated row is on screen. Rows without a modification time
          // sort after them and cannot be reached by a time cursor, so read
          // the remaining tail by offset in the same order.
          merged = mergeMediaPage(
            loaded,
            await queryMediaPage({
              filter,
              album,
              photosOnly,
              window: {
                mode: "offset",
                offset: loaded.length,
                limit: MEDIA_PAGE_SIZE + 1,
              },
            }),
          );
        }
        if (!alive.current || token !== request.current) return;
        assetsRef.current = merged.assets;
        setAssets(merged.assets);
        setHasMore(merged.hasMore);
      } catch {
        if (!alive.current || token !== request.current) return;
        // Keep the visible page; a retry needs a full refresh anyway.
        setHasMore(false);
      } finally {
        loadingMoreRef.current = false;
        if (alive.current) setLoadingMore(false);
      }
    })();
  }
  return {
    access,
    limited,
    assets,
    albums,
    recentCount,
    filter,
    albumId,
    currentAlbumTitle,
    loading,
    loadingMore,
    error,
    refreshingAlbums,
    checkAccess,
    manageAccess,
    refresh,
    refreshAlbums,
    refreshAlbumsIfStale,
    selectFilter,
    selectAlbum,
    loadMore,
  };
}
