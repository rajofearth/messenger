/**
 * Removes the files a signed-out account leaves on the device.
 *
 * The SQLite rows are cleared by the repository. Received and sent media,
 * avatars, picker and recording caches, the image and video libraries' caches,
 * and a downloaded update APK live on the filesystem, so without this the next
 * account would inherit them.
 */

import { Directory, Paths } from "expo-file-system";
import { Image } from "expo-image";
import { Platform } from "react-native";
import { clearVideoCacheAsync } from "expo-video";
import { clearAvatarCache } from "../data/avatars";
import { clearDownloads, isAppUpdaterAvailable } from "./appUpdater";

const MEDIA_FOLDERS = ["messenger-media", "message-media"];

/**
 * Cache directories a native library owns and may keep open. Their own clear
 * calls above empty them; deleting the directory as well can break playback,
 * because expo-video rotates to a fresh directory that a live `SimpleCache`
 * keeps using, and Glide holds its journal in `image_manager_disk_cache`.
 */
const NATIVE_CACHE_DIRS = new Set([
  "ExpoVideoCache",
  "image_manager_disk_cache",
]);

function removeDirectory(root: "document" | "cache", name: string) {
  try {
    const directory = new Directory(
      root === "cache" ? Paths.cache : Paths.document,
      name,
    );
    if (directory.exists) directory.delete();
  } catch {
    // A missing directory, a locked file or a platform without the native
    // filesystem must not block sign-out.
  }
}

/**
 * Removes every entry directly under the app cache directory except the ones a
 * native library owns. The root itself stays because native modules expect it
 * to exist. Image pickers, document pickers, voice recordings and thumbnails
 * each write their own folder here, so naming them one by one would let a new
 * one survive a sign-out.
 */
function clearCacheRoot() {
  try {
    const root = new Directory(Paths.cache);
    if (!root.exists) return;
    for (const item of root.list()) {
      if (NATIVE_CACHE_DIRS.has(item.name)) continue;
      try {
        item.delete();
      } catch {
        // A file another process holds open must not block the rest.
      }
    }
  } catch {
    // A platform without the native filesystem has no cache to clear.
  }
}

export async function clearLocalAccountFiles(): Promise<void> {
  try {
    clearAvatarCache();
  } catch {
    // The cache sweep below still removes the folder if the clear failed.
  }
  for (const name of MEDIA_FOLDERS) removeDirectory("document", name);

  // expo-video keeps up to 1 GiB by default. Its clear releases the old cache
  // and rotates to a new directory, so the sweep below must never delete
  // `ExpoVideoCache`; a live player rejects this call and keeps its cache
  // until the app restarts.
  if (Platform.OS !== "web") {
    try {
      await clearVideoCacheAsync();
    } catch {
      // A live player keeps its cache until the next sign-out.
    }
  }

  // expo-image uses Glide on Android (250 MiB disk cache by default) and
  // SDWebImage on iOS. Both clear their own directory before the sweep runs.
  try {
    await Image.clearMemoryCache();
  } catch {
    // A missing activity or an image still decoding must not block sign-out.
  }
  try {
    await Image.clearDiskCache();
  } catch {
    // The directory sweep still removes anything left outside the native cache.
  }

  if (isAppUpdaterAvailable) {
    await clearDownloads().catch(() => undefined);
  }
  clearCacheRoot();
}
