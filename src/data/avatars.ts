/**
 * Local copy of a remote avatar.
 *
 * Android system notifications only decode `file://` and `content://` images,
 * and contact avatars ship as remote URLs, so each one is downloaded once into
 * app cache and reused afterwards. Lists and notification payloads share this
 * cache, which is what keeps repeated avatars off the network.
 */

import { Directory, File, Paths } from "expo-file-system";
import { cacheKey, createCache } from "./cache";
import { imageCacheKey } from "../domain/imageVariants";
import { createAvatarReferenceIndex, type AvatarReference } from "./avatarReferences";

const remote = /^https?:\/\//i;
const local = /^(file|content|asset|data):/i;
const resolved = createCache<string>({ max: 256 });
const MAX_FILES = 240;
let downloads = 0;
const listeners = new Set<() => void>();

/** `false` when the native file system is unavailable (web, tests). */
const supported = (() => {
  try {
    return typeof Paths?.cache?.uri === "string";
  } catch {
    // expo-file-system's web shim throws while Paths is being evaluated, and an
    // avatar cache is not worth a crash at import time.
    return false;
  }
})();

function folder(): Directory | null {
  if (!supported) return null;
  const target = new Directory(Paths.cache, "avatars");
  if (!target.exists) target.create({ intermediates: true });
  return target;
}

function notify() {
  for (const listener of listeners) listener();
}

/** One cache file per storage object, however many signed URLs point at it. */
function avatarKey(uri: string) {
  return imageCacheKey(uri) ?? cacheKey(uri);
}

function deleteCachedFile(uri: string) {
  const key = avatarKey(uri);
  // Different signed URLs for the same avatar share one file, so keep it while
  // another live snapshot still links to that storage object.
  for (const other of references.references()) {
    if (other !== uri && avatarKey(other) === key) return;
  }
  resolved.delete(key);
  const directory = folder();
  if (directory) {
    try {
      const file = new File(directory, `${key}.img`);
      if (file.exists) file.delete();
    } catch {
      // A cache file the OS already removed is not worth reporting.
    }
  }
  notify();
}

const references = createAvatarReferenceIndex(deleteCachedFile);

/** Removes downloads the cache no longer references once the folder grows. */
function prune(directory: Directory) {
  const files = directory.list().filter((item): item is File => item instanceof File);
  let remaining = files.length - MAX_FILES;
  if (remaining <= 0) return;
  const keep = new Set<string>();
  for (const key of resolved.keys()) {
    const uri = resolved.get(key);
    if (uri) keep.add(uri);
  }
  for (const uri of references.references()) {
    keep.add(new File(directory, `${avatarKey(uri)}.img`).uri);
  }
  for (const file of files) {
    if (remaining <= 0) return;
    if (keep.has(file.uri)) continue;
    try {
      file.delete();
      remaining -= 1;
    } catch {
      // A file the OS already removed is not worth reporting.
    }
  }
}

async function download(uri: string, key: string): Promise<string> {
  const directory = folder();
  if (!directory) return "";
  // One file per storage object: chat, story and profile queries hand out a
  // different signed URL for the same person, and all of them land here.
  const target = new File(directory, `${key}.img`);
  if (target.exists && target.size > 0) return target.uri;
  const file = await File.downloadFileAsync(uri, target, { idempotent: true });
  downloads += 1;
  if (downloads % 25 === 0) prune(directory);
  return file.uri;
}

/**
 * Returns a locally readable URI for an avatar, or `undefined` when it cannot be
 * made local. Already-local URIs pass through untouched. A download failure is
 * never fatal: the caller posts the notification without an avatar instead.
 */
export async function localAvatarUri(
  uri: string | undefined,
): Promise<string | undefined> {
  if (!uri) return undefined;
  if (local.test(uri)) return uri;
  if (!remote.test(uri)) return undefined;
  const key = avatarKey(uri);
  const cached = resolved.get(key);
  if (cached) {
    if (new File(cached).exists) return cached;
    // Android can clear the cache directory, so a stale entry is dropped
    // instead of being handed back for the rest of the session.
    resolved.delete(key);
  }
  const file = await resolved.load(key, () => download(uri, key)).catch(() => "");
  return file || undefined;
}

/** Keeps current server snapshots tied to the files they still use. */
export function syncAvatarReferences(
  scope: string,
  values: AvatarReference[],
) {
  references.sync(scope, values);
}

/** Lets avatar UI refresh if a cache file is cleared while it is mounted. */
export function subscribeAvatarCache(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Drops every cached avatar file and memory entry. */
export function clearAvatarCache() {
  resolved.clear();
  const directory = folder();
  if (directory) {
    for (const item of directory.list()) {
      try {
        item.delete();
      } catch {
        // Ignore entries the OS removed first.
      }
    }
  }
  notify();
}

/** Local URI when the avatar is already cached, without touching the network. */
export function cachedAvatarUri(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  if (local.test(uri)) return uri;
  if (!remote.test(uri)) return undefined;
  const key = avatarKey(uri);
  const cached = resolved.get(key);
  if (cached && new File(cached).exists) return cached;
  const directory = folder();
  if (!directory) return undefined;
  const target = new File(directory, `${key}.img`);
  if (!target.exists || target.size <= 0) return undefined;
  resolved.set(key, target.uri);
  return target.uri;
}

/**
 * Downloads avatars in the background, newest list first, so a ringing call or a
 * notification usually has a local image ready before it is needed.
 */
export function warmAvatars(uris: Array<string | undefined>, limit = 12) {
  if (!supported) return;
  const queue: string[] = [];
  const seen = new Set<string>();
  for (const uri of uris) {
    if (queue.length >= limit) break;
    if (!uri || !remote.test(uri)) continue;
    const key = avatarKey(uri);
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(uri);
  }
  let running = 0;
  const pump = () => {
    while (running < 2 && queue.length) {
      const next = queue.shift() as string;
      if (cachedAvatarUri(next)) continue;
      running += 1;
      void localAvatarUri(next)
        .catch(() => undefined)
        .finally(() => {
          running -= 1;
          pump();
        });
    }
  };
  pump();
}
