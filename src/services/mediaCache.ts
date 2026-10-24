import { Directory, File, Paths } from "expo-file-system";
import { Album, Asset, requestPermissionsAsync } from "expo-media-library";
import type { Message, Story } from "../domain/data";

const FOLDER = "messenger-media";
const ALBUM = "Messenger";

function mediaDirectory() {
  const directory = new Directory(Paths.document, FOLDER);
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

function extensionFor(name?: string, mimeType?: string) {
  const fromName = name?.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (mimeType?.startsWith("video/")) return "mp4";
  if (mimeType?.startsWith("audio/")) return "m4a";
  if (mimeType?.startsWith("image/")) return mimeType.includes("png") ? "png" : "jpg";
  return "bin";
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

/**
 * Keeps received media in app storage so a thread and its stories render from
 * disk after the first fetch. The remote URL is only a fallback.
 */
export async function cacheRemoteMedia(input: {
  id: string;
  uri?: string;
  filename?: string;
  mimeType?: string;
  kind?: Message["kind"] | "story";
}) {
  if (!input.uri || !/^https?:\/\//i.test(input.uri)) return input.uri;
  const extension = extensionFor(
    input.filename,
    input.mimeType || (input.kind === "story" ? "image/jpeg" : undefined),
  );
  const file = new File(
    mediaDirectory(),
    `${safeName(input.id)}.${extension}`,
  );
  if (file.exists) return file.uri;
  try {
    const downloaded = await File.downloadFileAsync(input.uri, file, {
      idempotent: true,
    });
    return downloaded.uri;
  } catch {
    if (file.exists) file.delete();
    return input.uri;
  }
}

/** Downloads the visible stories, newest first, and points them at local files. */
export async function prefetchStories(stories: Story[], limit = 8) {
  const now = Date.now();
  const targets = [...stories]
    .filter((story) => !story.expiresAt || story.expiresAt > now)
    .sort((a, b) => (b.expiresAt ?? 0) - (a.expiresAt ?? 0))
    .slice(0, limit);
  const ids = new Set(targets.map((story) => story.id));
  const cached = new Map<string, string>();
  await Promise.all(
    targets.map(async (story) => {
      const uri = await cacheRemoteMedia({
        id: `story-${story.id}`,
        uri: story.image,
        mimeType: story.video ? "video/mp4" : "image/jpeg",
        kind: "story",
      });
      if (uri) cached.set(story.id, uri);
    }),
  );
  return stories.map((story) =>
    ids.has(story.id) && cached.has(story.id)
      ? { ...story, image: cached.get(story.id)! }
      : story,
  );
}

/**
 * Copies a downloaded file into the Messenger album. Permission is requested
 * only when the user has opted into gallery visibility.
 */
export async function saveMediaToGallery(uri: string) {
  if (!uri.startsWith("file://")) return false;
  const permission = await requestPermissionsAsync(true, ["photo", "video"]);
  if (!permission.granted) return false;
  const album = await Album.get(ALBUM);
  const asset = await Asset.create(uri);
  if (album) await album.add(asset);
  else await Album.create(ALBUM, [asset]);
  return true;
}

export async function saveStoryToGallery(input: {
  id: string;
  uri: string;
  video: boolean;
}) {
  const localUri = await cacheRemoteMedia({
    id: `story-save-${input.id}`,
    uri: input.uri,
    mimeType: input.video ? "video/mp4" : "image/jpeg",
    kind: "story",
  });
  return localUri ? saveMediaToGallery(localUri) : false;
}
