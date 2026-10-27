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
  chooseImageSource,
  imageCacheKey,
  pickImageVariant,
  storageIdFromUrl,
  targetPixels,
  variantName,
  variantWidths,
} = load("./imageVariants.ts", { "../data/cache": cache });

const photo = "https://example.convex.cloud/api/storage/source?token=one";
const variants = [
  {
    name: "w256",
    width: 256,
    height: 192,
    uri: "https://example.convex.cloud/api/storage/k256?token=one",
    mimeType: "image/webp",
  },
  {
    name: "w512",
    width: 512,
    height: 384,
    uri: "https://example.convex.cloud/api/storage/k512?token=one",
    mimeType: "image/webp",
  },
  {
    name: "w1080",
    width: 1080,
    height: 810,
    uri: "https://example.convex.cloud/api/storage/k1080?token=one",
    mimeType: "image/webp",
  },
];

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

test("a bubble asks for the smallest variant covering its 2x slot", () => {
  const bubble = chooseImageSource({
    uri: photo,
    variants,
    displayWidth: 220,
    density: 2,
  });
  assert.equal(bubble.kind, "variant");
  assert.equal(bubble.width, 512);
  assert.equal(bubble.name, "w512");
  assert.equal(bubble.mimeType, "image/webp");
  assert.equal(bubble.uri, variants[1].uri);
  assert.equal(bubble.cacheKey, "storage-k512");
  // A narrow slot still needs the smallest cover: 128dp at 2x is 256px.
  assert.equal(
    chooseImageSource({
      uri: photo,
      variants,
      displayWidth: 128,
      density: 2,
    }).width,
    256,
  );
});

test("a slot between stored widths takes the next one up", () => {
  // 200dp at 2x is 400 device pixels, so w256 cannot cover it.
  const choice = chooseImageSource({
    uri: photo,
    variants,
    displayWidth: 200,
    density: 2,
  });
  assert.equal(choice.width, 512);
});

test("a target above the largest variant falls back unless it matches the source", () => {
  const small = variants.slice(0, 2);
  const original = chooseImageSource({
    uri: photo,
    variants: small,
    sourceWidth: 4000,
    displayWidth: 1000,
    density: 2,
  });
  assert.equal(original.kind, "original");
  assert.equal(original.uri, photo);
  assert.equal(original.cacheKey, imageCacheKey(photo));

  const matching = chooseImageSource({
    uri: photo,
    variants,
    sourceWidth: 1080,
    displayWidth: 1000,
    density: 2,
  });
  assert.equal(matching.kind, "variant");
  assert.equal(matching.width, 1080);

  const unknown = chooseImageSource({
    uri: photo,
    variants: small,
    displayWidth: 1000,
    density: 2,
  });
  assert.equal(unknown.kind, "original");
});

test("a downloaded preview is reused only when it covers the chosen variant", () => {
  const preview = { uri: "file:///cache/photo-w512.webp", width: 512 };
  const same = chooseImageSource({
    uri: photo,
    variants,
    displayWidth: 220,
    density: 2,
    preview,
  });
  assert.deepEqual(same, { kind: "local", uri: preview.uri });

  const widePreviewForSmall = chooseImageSource({
    uri: photo,
    variants,
    displayWidth: 100,
    density: 2,
    preview,
  });
  assert.deepEqual(widePreviewForSmall, { kind: "local", uri: preview.uri });

  const wider = chooseImageSource({
    uri: photo,
    variants,
    displayWidth: 100,
    density: 2,
    preview: { uri: "file:///cache/photo-w1080.webp", width: 1080 },
  });
  assert.deepEqual(wider, { kind: "local", uri: "file:///cache/photo-w1080.webp" });

  const tooNarrow = chooseImageSource({
    uri: photo,
    variants,
    displayWidth: 540,
    density: 2,
    preview,
  });
  assert.equal(tooNarrow.kind, "variant");
  assert.equal(tooNarrow.width, 1080);
});

test("a local original wins over variants and a preview", () => {
  const local = "file:///cache/original.jpg";
  assert.deepEqual(
    chooseImageSource({
      uri: local,
      variants,
      displayWidth: 220,
      density: 2,
      preview: { uri: "file:///cache/photo-w512.webp", width: 512 },
    }),
    { kind: "local", uri: local },
  );
});

test("variant cache keys follow the storage object, not the signed URL", () => {
  const choice = (token) =>
    chooseImageSource({
      uri: `${photo.split("?")[0]}?token=${token}`,
      variants: [
        {
          ...variants[1],
          uri: `https://example.convex.cloud/api/storage/k512?token=${token}`,
        },
      ],
      displayWidth: 220,
      density: 2,
    });
  assert.equal(choice("first").cacheKey, "storage-k512");
  assert.equal(choice("second").cacheKey, choice("first").cacheKey);
  const tenEighty = chooseImageSource({
    uri: photo,
    variants,
    displayWidth: 540,
    density: 2,
  });
  assert.equal(tenEighty.cacheKey, "storage-k1080");
  assert.notEqual(tenEighty.cacheKey, choice("first").cacheKey);
});

test("no variants keeps the original and no uri has no choice", () => {
  assert.deepEqual(chooseImageSource({ uri: photo, displayWidth: 220, density: 2 }), {
    kind: "original",
    uri: photo,
    cacheKey: imageCacheKey(photo),
  });
  assert.equal(chooseImageSource({ displayWidth: 220, density: 2 }), undefined);
  assert.equal(
    chooseImageSource({ uri: "", variants, displayWidth: 220, density: 2 }),
    undefined,
  );
});
