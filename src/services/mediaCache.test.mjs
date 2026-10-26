import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const sourceUri = "file:///private/documents/story.jpg";
const publicUri = "file:///storage/emulated/0/Pictures/Messenger/story.jpg";
const pickedUri = "content://media/external/video/media/7";

function harness(options = {}) {
  const events = [];
  const calls = [];
  const copied = new Set();
  const album = { id: "messenger", add: async () => { calls.push(["add"]); } };
  const asset = {
    id: "content://media/external/images/media/1",
    getInfo: async () => {
      if (options.missingAsset) throw new Error("Missing MediaStore row");
      return { uri: options.privateCopy ? sourceUri : publicUri, mediaType: options.mediaType ?? "image", width: options.width ?? 1080, height: 720 };
    },
    getAlbums: async () => options.wrongAlbum ? [] : [album],
  };
  class File {
    constructor(uri, name) { this.uri = name ? `${uri.uri}/${name}` : uri; }
    get exists() { return !options.missingFile && ([sourceUri, publicUri].includes(this.uri) || (options.localSource && this.uri === pickedUri) || copied.has(this.uri)); }
    get size() { return options.emptyFile ? 0 : options.shortCopy && this.uri === publicUri ? 10 : 100; }
    async copy(destination) { copied.add(destination.uri); calls.push(["copy", this.uri, destination.uri]); }
    delete() { copied.delete(this.uri); }
    static downloadFileAsync = async () => { throw new Error("Offline"); };
  }
  const modules = {
    "expo-file-system": { File, Directory: class {
      exists = true;
      uri = "file:///private/documents/messenger-media";
      constructor() { if (options.cacheFails) throw new Error("Cache unavailable"); }
    }, Paths: { document: { uri: "file:///private/documents/" }, cache: { uri: "file:///private/cache/" } } },
    "react-native": { Platform: { OS: "android" } },
    "expo-media-library": {
      MediaType: { IMAGE: "image", VIDEO: "video" },
      requestPermissionsAsync: async () => { calls.push(["permission"]); return { granted: !options.denied }; },
      Album: {
        get: async () => options.newAlbum ? null : album,
        create: async (...args) => { calls.push(["albumCreate", ...args]); return album; },
      },
      Asset: { create: async (...args) => { calls.push(["assetCreate", ...args]); return asset; } },
    },
    "./devTelemetry": { trackDevEvent: (event, fields) => events.push({ event, ...fields }) },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("./mediaCache.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    assert.ok(name in modules, `Missing mock: ${name}`);
    return modules[name];
  }, exports);
  return { ...exports, events, calls, asset, album };
}

test("exports directly into an existing album without a second move or duplicate", async () => {
  const app = harness();
  assert.equal(await app.saveMediaToGallery(sourceUri), true);
  assert.deepEqual(app.calls.find(([name]) => name === "assetCreate"), ["assetCreate", sourceUri, app.album]);
  assert.equal(app.calls.some(([name]) => name === "add"), false);
  assert.ok(app.events.some(({ event, bytes }) => event === "gallery_save_verified" && bytes === 100));
});

test("the first save explicitly moves the exported asset into the new album", async () => {
  const app = harness({ newAlbum: true });
  assert.equal(await app.saveMediaToGallery(sourceUri), true);
  assert.deepEqual(app.calls.find(([name]) => name === "albumCreate"), ["albumCreate", "Messenger", [app.asset], true]);
});

for (const [label, options] of [
  ["missing source file", { missingFile: true }],
  ["empty source file", { emptyFile: true }],
  ["gallery permission denied", { denied: true }],
  ["missing MediaStore row", { missingAsset: true }],
  ["copy still in app-private storage", { privateCopy: true }],
  ["copy outside the requested album", { wrongAlbum: true }],
  ["truncated public copy", { shortCopy: true }],
  ["unknown media type", { mediaType: "unknown" }],
  ["undecodable media dimensions", { width: 0 }],
  ["invalid media dimensions", { width: NaN }],
]) {
  test(`does not report gallery success for ${label}`, async () => {
    const app = harness(options);
    assert.equal(await app.saveMediaToGallery(sourceUri).catch(() => false), false);
    assert.equal(app.events.some(({ event }) => event === "gallery_save_verified"), false);
  });
}

test("does not report story success after download failure", async () => {
  const app = harness();
  assert.equal(await app.saveStoryToGallery({ id: "story-1", uri: "https://example.invalid/story.jpg", video: false }), false);
  assert.equal(app.calls.length, 0);
});

test("selected content media is copied into app storage before review", async () => {
  const app = harness({ localSource: true });
  const uri = await app.cacheLocalMedia({ id: "picked-video", uri: pickedUri, mimeType: "video/mp4" });
  assert.match(uri, /messenger-media\/picked-video\.mp4$/);
  assert.deepEqual(app.calls.find(([name]) => name === "copy"), ["copy", pickedUri, uri]);
});

test("cache failures record a safe failure result rather than losing the outcome event", async () => {
  const app = harness({ cacheFails: true });
  assert.equal(await app.saveStoryToGallery({ id: "story-1", uri: "https://example.invalid/story.jpg", video: false }), false);
  assert.ok(app.events.some(({ event, errorCode }) => event === "gallery_save_failed" && errorCode === "cache_failed"));
  assert.ok(app.events.some(({ event }) => event === "story_save_failed"));
  assert.equal(JSON.stringify(app.events).includes("example.invalid"), false);
});

test("a verified video export emits video kind and story completion without private paths", async () => {
  const app = harness({ mediaType: "video" });
  assert.equal(await app.saveStoryToGallery({ id: "story-1", uri: sourceUri, video: true }), true);
  assert.ok(app.events.some(({ event, video }) => event === "gallery_save_verified" && video === true));
  assert.ok(app.events.some(({ event }) => event === "story_save_completed"));
  assert.equal(JSON.stringify(app.events).includes(sourceUri), false);
  assert.equal(JSON.stringify(app.events).includes(publicUri), false);
});
