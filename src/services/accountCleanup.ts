/**
 * Removes the files a signed-out account leaves on the device.
 *
 * Messages live in AsyncStorage and are cleared by the repository. Received and
 * sent media, the avatar cache and a downloaded update APK live on the
 * filesystem, so without this the next account would inherit them.
 */

import { Directory, Paths } from "expo-file-system";
import { clearAvatarCache } from "../data/avatars";
import { clearDownloads, isAppUpdaterAvailable } from "./appUpdater";

const MEDIA_FOLDERS = ["messenger-media", "message-media"];

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

export async function clearLocalAccountFiles(): Promise<void> {
  try {
    clearAvatarCache();
  } catch {
    // The folder delete below still runs if the cache was already gone.
  }
  for (const name of MEDIA_FOLDERS) removeDirectory("document", name);
  removeDirectory("cache", "avatars");
  if (isAppUpdaterAvailable) {
    await clearDownloads().catch(() => undefined);
  }
}
