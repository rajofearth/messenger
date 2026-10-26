import test from "node:test";
import assert from "node:assert/strict";
import {
  MEDIA_VARIANT_NAMES,
  variantByteLimit,
  variantWidthForName,
  validateMediaVariants,
} from "../convex/lib/mediaVariantRules.ts";

function candidate(overrides = {}) {
  return {
    storageId: "variant-256",
    name: "w256",
    mimeType: "image/webp",
    width: 256,
    height: 192,
    bytes: 1234,
    ...overrides,
  };
}

function storageOf(sizes, contentTypes = {}) {
  return (id) =>
    id in sizes
      ? { size: sizes[id], contentType: contentTypes[id] ?? "image/webp" }
      : undefined;
}

test("variant names map to the widths and byte ceilings the server accepts", () => {
  assert.deepEqual([...MEDIA_VARIANT_NAMES], ["w256", "w512", "w1080"]);
  assert.equal(variantWidthForName("w256"), 256);
  assert.equal(variantWidthForName("w512"), 512);
  assert.equal(variantWidthForName("w1080"), 1080);
  assert.equal(variantWidthForName("w1024"), undefined);
  assert.equal(variantByteLimit("w256"), 128 * 1024);
  assert.equal(variantByteLimit("w512"), 384 * 1024);
  assert.equal(variantByteLimit("w1080"), 1024 * 1024);
  assert.equal(variantByteLimit("w1024"), undefined);
});

test("a valid batch keeps the storage size and ignores the client bytes field", () => {
  const validated = validateMediaVariants(
    [candidate({ bytes: 0 })],
    "main",
    storageOf({ "variant-256": 40_000 }),
  );
  assert.equal(validated?.length, 1);
  assert.equal(validated?.[0].size, 40_000);
  assert.equal(validated?.[0].mimeType, "image/webp");
  // A huge client claim cannot make a small object invalid either.
  const hugeClaim = validateMediaVariants(
    [candidate({ bytes: 999_999_999 })],
    "main",
    storageOf({ "variant-256": 40_000 }),
  );
  assert.equal(hugeClaim?.length, 1);
});

test("width must be within two pixels of the name", () => {
  for (const width of [254, 256, 258]) {
    assert.equal(
      validateMediaVariants(
        [candidate({ width })],
        "main",
        storageOf({ "variant-256": 1000 }),
      )?.length,
      1,
      `width ${width}`,
    );
  }
  for (const width of [253, 259]) {
    assert.equal(
      validateMediaVariants(
        [candidate({ width })],
        "main",
        storageOf({ "variant-256": 1000 }),
      ),
      undefined,
      `width ${width}`,
    );
  }
});

test("per-name byte ceilings reject an oversized thumbnail", () => {
  assert.equal(
    validateMediaVariants(
      [candidate()],
      "main",
      storageOf({ "variant-256": 128 * 1024 }),
    )?.length,
    1,
  );
  assert.equal(
    validateMediaVariants(
      [candidate()],
      "main",
      storageOf({ "variant-256": 128 * 1024 + 1 }),
    ),
    undefined,
  );
});

test("duplicate names, duplicate ids and the main id are rejected", () => {
  const storage = storageOf({
    "variant-256": 1000,
    "variant-512": 1000,
  });
  assert.equal(
    validateMediaVariants(
      [candidate(), candidate({ storageId: "variant-512" })],
      "main",
      storage,
    ),
    undefined,
  );
  assert.equal(
    validateMediaVariants(
      [candidate(), candidate({ name: "w512", width: 512 })],
      "main",
      storage,
    ),
    undefined,
  );
  assert.equal(
    validateMediaVariants(
      [candidate({ storageId: "main" })],
      "main",
      storage,
    ),
    undefined,
  );
});

test("only webp or png variants are accepted", () => {
  for (const mimeType of ["image/webp", "image/png", "IMAGE/WEBP; q=1"]) {
    assert.equal(
      validateMediaVariants(
        [candidate({ mimeType })],
        "main",
        storageOf({ "variant-256": 1000 }),
      )?.length,
      1,
      mimeType,
    );
  }
  for (const mimeType of ["image/jpeg", "video/mp4", "application/octet-stream"]) {
    assert.equal(
      validateMediaVariants(
        [candidate({ mimeType })],
        "main",
        // Storage has no usable type, so the claimed type decides.
        storageOf(
          { "variant-256": 1000 },
          { "variant-256": "application/octet-stream" },
        ),
      ),
      undefined,
      mimeType,
    );
  }
});

test("the stored content type wins unless storage reports the generic fallback", () => {
  const storedJpeg = validateMediaVariants(
    [candidate({ mimeType: "image/webp" })],
    "main",
    storageOf({ "variant-256": 1000 }, { "variant-256": "image/jpeg" }),
  );
  assert.equal(storedJpeg, undefined);
  const fallback = validateMediaVariants(
    [candidate({ mimeType: "image/png" })],
    "main",
    storageOf(
      { "variant-256": 1000 },
      { "variant-256": "application/octet-stream" },
    ),
  );
  assert.equal(fallback?.[0].mimeType, "image/png");
});

test("missing objects, empty objects and impossible dimensions are rejected", () => {
  const missing = validateMediaVariants(
    [candidate()],
    "main",
    storageOf({}),
  );
  assert.equal(missing, undefined);
  const empty = validateMediaVariants(
    [candidate()],
    "main",
    storageOf({ "variant-256": 0 }),
  );
  assert.equal(empty, undefined);
  for (const overrides of [
    { name: "w1024", width: 1024 },
    { width: 0, height: 192 },
    { height: 0 },
    { height: 8193 },
    { height: Number.NaN },
  ]) {
    assert.equal(
      validateMediaVariants(
        [candidate({ storageId: `id-${JSON.stringify(overrides)}`, ...overrides })],
        "main",
        storageOf({ [`id-${JSON.stringify(overrides)}`]: 1000 }),
      ),
      undefined,
      JSON.stringify(overrides),
    );
  }
});

test("a batch is capped at three variants", () => {
  const variants = [
    candidate(),
    candidate({ storageId: "v512", name: "w512", width: 512 }),
    candidate({ storageId: "v1080", name: "w1080", width: 1080 }),
    candidate({ storageId: "v1080b", name: "w1080", width: 1080 }),
  ];
  assert.equal(
    validateMediaVariants(
      variants,
      "main",
      storageOf({ "v512": 1000, v1080: 1000, v1080b: 1000 }),
    ),
    undefined,
  );
});
