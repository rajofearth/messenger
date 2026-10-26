import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const NATIVE_CACHE_ENTRIES = ["ExpoVideoCache", "image_manager_disk_cache"];

const CACHE_ENTRIES = [
  "avatars",
  "ImagePicker",
  ...NATIVE_CACHE_ENTRIES,
  "keyboard-media",
  "media-thumbnails",
  "updates",
  "Audio",
];

function harness(options = {}) {
  const calls = [];
  const deleted = [];
  const missing = options.missing ?? [];
  const throwing = options.throwing ?? [];
  const cacheEntries = new Set(
    (options.cacheEntries ?? CACHE_ENTRIES).filter(
      (name) => !missing.includes(name),
    ),
  );
  class Directory {
    constructor(root, name) {
      this.root = root.uri;
      this.name = name;
      this.uri = name ? `${root.uri}${name}/` : root.uri;
      this.exists = name ? !missing.includes(name) : true;
    }
    list() {
      if (this.name !== undefined) return [];
      return [...cacheEntries].map((name) => ({
        name,
        delete: () => {
          if (throwing.includes(name)) {
            throw new Error(`Cannot delete ${name}`);
          }
          cacheEntries.delete(name);
          deleted.push(`file:///cache/${name}`);
        },
      }));
    }
    delete() {
      if (this.name === undefined) return;
      if (throwing.includes(this.name)) {
        throw new Error(`Cannot delete ${this.name}`);
      }
      if (this.root === "file:///cache/") cacheEntries.delete(this.name);
      deleted.push(`${this.root}${this.name}`);
    }
  }
  const modules = {
    "expo-file-system": {
      Directory,
      Paths: {
        document: { uri: "file:///documents/" },
        cache: { uri: "file:///cache/" },
      },
    },
    "expo-image": {
      Image: {
        clearMemoryCache: async () => {
          calls.push("clearImageMemory");
          return true;
        },
        clearDiskCache: async () => {
          calls.push("clearImageDisk");
          return true;
        },
      },
    },
    "expo-video": {
      clearVideoCacheAsync: async () => {
        calls.push("clearVideo");
        if (options.videoClearThrows) throw new Error("A player is active");
      },
    },
    "react-native": {
      Platform: { OS: options.platform ?? "android" },
    },
    "../data/avatars": {
      clearAvatarCache: () => {
        calls.push("clearAvatarCache");
        if (options.avatarClearThrows) throw new Error("Cache unavailable");
      },
    },
    "./appUpdater": {
      isAppUpdaterAvailable: options.updaterAvailable ?? true,
      clearDownloads: async () => {
        calls.push("clearDownloads");
        return { deleted: 1 };
      },
    },
  };
  const compiled = ts.transpileModule(
    readFileSync(new URL("./accountCleanup.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    assert.ok(name in modules, `Missing mock: ${name}`);
    return modules[name];
  }, exports);
  return { ...exports, calls, deleted, remaining: () => [...cacheEntries] };
}

const CACHE_SWEEP = CACHE_ENTRIES.filter(
  (name) => name !== "avatars" && !NATIVE_CACHE_ENTRIES.includes(name),
).map((name) => `file:///cache/${name}`);

test("sign-out clears media folders, native caches, and every owned cache entry", async () => {
  const app = harness();
  await app.clearLocalAccountFiles();
  assert.deepEqual(app.calls, [
    "clearAvatarCache",
    "clearVideo",
    "clearImageMemory",
    "clearImageDisk",
    "clearDownloads",
  ]);
  assert.deepEqual(app.deleted, [
    "file:///documents/messenger-media",
    "file:///documents/message-media",
    "file:///cache/avatars",
    ...CACHE_SWEEP,
  ]);
  // expo-video's rotated cache and Glide's journal stay for their owners.
  assert.deepEqual(app.remaining(), NATIVE_CACHE_ENTRIES);
});

test("folders that are already gone are skipped", async () => {
  const app = harness({ missing: ["messenger-media", "avatars"] });
  await app.clearLocalAccountFiles();
  assert.deepEqual(app.deleted, [
    "file:///documents/message-media",
    ...CACHE_SWEEP,
  ]);
});

test("the update APK is cleared only when the updater is available", async () => {
  const available = harness();
  await available.clearLocalAccountFiles();
  assert.ok(available.calls.includes("clearDownloads"));

  const unavailable = harness({ updaterAvailable: false });
  await unavailable.clearLocalAccountFiles();
  assert.equal(unavailable.calls.includes("clearDownloads"), false);
});

test("a directory that cannot be deleted does not reject sign-out", async () => {
  const app = harness({ throwing: ["messenger-media"] });
  await assert.doesNotReject(app.clearLocalAccountFiles());
  // The failure is contained so the remaining folders are still cleaned.
  assert.deepEqual(app.deleted, [
    "file:///documents/message-media",
    "file:///cache/avatars",
    ...CACHE_SWEEP,
  ]);
});

test("an avatar cache failure still removes the other folders", async () => {
  const app = harness({ avatarClearThrows: true });
  await assert.doesNotReject(app.clearLocalAccountFiles());
  assert.deepEqual(app.deleted, [
    "file:///documents/messenger-media",
    "file:///documents/message-media",
    "file:///cache/avatars",
    ...CACHE_SWEEP,
  ]);
});

test("a live video player does not stop the rest of the cache from clearing", async () => {
  const app = harness({ videoClearThrows: true });
  await app.clearLocalAccountFiles();
  assert.deepEqual(app.deleted, [
    "file:///documents/messenger-media",
    "file:///documents/message-media",
    "file:///cache/avatars",
    ...CACHE_SWEEP,
  ]);
  // The live player keeps its cache; the sweep never touches that directory.
  assert.deepEqual(app.remaining(), NATIVE_CACHE_ENTRIES);
});

test("web skips the native video call and leaves the video cache directory alone", async () => {
  const app = harness({ platform: "web" });
  await app.clearLocalAccountFiles();
  assert.equal(app.calls.includes("clearVideo"), false);
  assert.ok(app.deleted.includes("file:///cache/ImagePicker"));
  assert.equal(app.deleted.includes("file:///cache/ExpoVideoCache"), false);
  assert.equal(app.remaining().includes("ExpoVideoCache"), true);
});
