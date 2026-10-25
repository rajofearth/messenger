import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pruneExtraDensities } from "./prune-densities.mjs";

const RES = path.join("app", "src", "main", "res");

// [directory, filename, bytes] for everything the prune must remove.
const PRUNED = [
  ["mipmap-mdpi", "ic_launcher.webp", 101],
  ["mipmap-hdpi", "ic_launcher_round.webp", 202],
  ["mipmap-xhdpi", "ic_launcher_foreground.webp", 303],
  ["mipmap-xxhdpi", "ic_launcher_monochrome.webp", 404],
  ["drawable-mdpi", "splashscreen_logo.png", 505],
  ["drawable-xxhdpi", "splashscreen_logo.png", 606],
];

// Everything the prune must leave alone: the highest density, adaptive and
// no-density resources, the adaptive background and unrelated names.
const KEPT = [
  ["mipmap-xxxhdpi", "ic_launcher.webp"],
  ["drawable-xxxhdpi", "splashscreen_logo.png"],
  ["mipmap-anydpi-v26", "ic_launcher.xml"],
  ["drawable-nodpi", "blue_noise.webp"],
  ["mipmap-mdpi", "ic_launcher_background.webp"],
  ["mipmap-mdpi", "unrelated.png"],
  ["drawable", "ic_launcher.webp"],
  ["mipmap-mdpi/nested", "ic_launcher.webp"],
];

function write(root, dir, name, bytes) {
  const target = path.join(root, RES, dir, name);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, Buffer.alloc(bytes, 0x61));
}

function makeTree() {
  const androidRoot = mkdtempSync(path.join(tmpdir(), "messenger-prune-"));
  for (const [dir, name, bytes] of PRUNED) write(androidRoot, dir, name, bytes);
  for (const [dir, name] of KEPT) write(androidRoot, dir, name, 32);
  return androidRoot;
}

const resOf = (root) => path.join(root, RES);
const fileOf = (root, dir, name) => path.join(resOf(root), dir, name);

test("prunes only the low-density launcher and splash rasters, once", () => {
  const androidRoot = makeTree();
  try {
    const expectedBytes = PRUNED.reduce((sum, [, , bytes]) => sum + bytes, 0);
    assert.deepEqual(pruneExtraDensities(androidRoot), {
      files: PRUNED.length,
      bytes: expectedBytes,
    });

    for (const [dir, name] of PRUNED) {
      assert.equal(existsSync(fileOf(androidRoot, dir, name)), false, `${dir}/${name} removed`);
    }
    for (const [dir, name] of KEPT) {
      assert.equal(existsSync(fileOf(androidRoot, dir, name)), true, `${dir}/${name} kept`);
    }

    // A reused android/ tree is already pruned; a second build must not fail.
    assert.deepEqual(pruneExtraDensities(androidRoot), { files: 0, bytes: 0 });
    for (const [dir, name] of KEPT) {
      assert.equal(existsSync(fileOf(androidRoot, dir, name)), true, `${dir}/${name} still kept`);
    }
  } finally {
    rmSync(androidRoot, { recursive: true, force: true });
  }
});

test("a project without a generated res directory is a no-op", () => {
  const androidRoot = mkdtempSync(path.join(tmpdir(), "messenger-prune-"));
  try {
    assert.equal(existsSync(resOf(androidRoot)), false);
    assert.deepEqual(pruneExtraDensities(androidRoot), { files: 0, bytes: 0 });
  } finally {
    rmSync(androidRoot, { recursive: true, force: true });
  }
});
