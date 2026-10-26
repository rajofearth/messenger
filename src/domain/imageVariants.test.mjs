import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Node strips the types but cannot resolve this module's extensionless runtime
// import, so compile the pair the way src/domain/outbox.test.mjs does.
function load(relative, modules = {}) {
  const compiled = ts.transpileModule(
    readFileSync(new URL(relative, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    assert.ok(name in modules, `Missing mock: ${name}`);
    return modules[name];
  }, exports);
  return exports;
}

const cache = load("../data/cache.ts");
const {
  IMAGE_VARIANT_WIDTHS,
  imageCacheKey,
  pickImageVariant,
  storageIdFromUrl,
  targetPixels,
  variantName,
  variantWidths,
} = load("./imageVariants.ts", { "../data/cache": cache });

test("variant widths never upscale the source", () => {
  assert.deepEqual([...IMAGE_VARIANT_WIDTHS], [256, 512, 1080]);
  assert.deepEqual(variantWidths(2000), [256, 512, 1080]);
  assert.deepEqual(variantWidths(1080), [256, 512, 1080]);
  assert.deepEqual(variantWidths(512), [256, 512]);
  assert.deepEqual(variantWidths(200), []);
});

test("variant picking prefers the smallest cover, then the largest", () => {
  const variants = [
    { name: "w256", width: 256 },
    { name: "w512", width: 512 },
    { name: "w1080", width: 1080 },
  ];
  assert.equal(pickImageVariant(variants, 512)?.width, 512);
  assert.equal(pickImageVariant(variants, 300)?.width, 512);
  assert.equal(pickImageVariant(variants, 2000)?.width, 1080);
  assert.equal(pickImageVariant([], 300), undefined);
});

test("target pixels apply the 2x density cap and round up", () => {
  assert.equal(targetPixels(100, 3), 200);
  assert.equal(targetPixels(100, 1.5), 150);
  assert.equal(targetPixels(100, 0.5), 100);
  assert.equal(targetPixels(10.1, 2), 21);
});

test("storage ids ignore signed query strings and fragments", () => {
  assert.equal(
    storageIdFromUrl("https://example.convex.cloud/api/storage/kg2abc?token=x#y"),
    "kg2abc",
  );
  assert.equal(storageIdFromUrl("https://example.com/photo.jpg"), undefined);
  assert.equal(storageIdFromUrl("file:///cache/avatars/a.img"), undefined);
});

test("signed URLs for one storage object share a cache key", () => {
  const first = imageCacheKey(
    "https://example.convex.cloud/api/storage/kg2abc?token=first",
  );
  const second = imageCacheKey(
    "https://example.convex.cloud/api/storage/kg2abc?token=second",
  );
  assert.equal(first, "storage-kg2abc");
  assert.equal(second, first);
  assert.notEqual(
    imageCacheKey("https://example.convex.cloud/api/storage/other"),
    first,
  );
});

test("other remote URLs hash stably and local files have no key", () => {
  const uri = "https://cdn.example.com/avatar.jpg?size=small";
  assert.equal(imageCacheKey(uri), cache.cacheKey(uri));
  assert.equal(imageCacheKey(uri), imageCacheKey(uri));
  assert.equal(imageCacheKey("file:///cache/a.jpg"), undefined);
  assert.equal(imageCacheKey("content://media/1"), undefined);
  assert.equal(imageCacheKey("data:image/png;base64,AAAA"), undefined);
  assert.equal(imageCacheKey("/relative/avatar.jpg"), undefined);
});

test("variant names describe their width", () => {
  assert.equal(variantName(256), "w256");
  assert.equal(variantName(1080), "w1080");
});
