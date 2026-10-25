// Expo's prebuild writes launcher and splash art at five densities. Only the
// highest density has to ship: Android downsamples a larger bitmap for a
// smaller screen, but it never upsamples a smaller one, so every lower raster
// is dead weight in the APK. Keep xxxhdpi and drop the rest.
//
// `ic_launcher_background` is deliberately absent from the prune set: the
// adaptive icon references it per density, so it is not a duplicate.

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const DENSITY = /^(mipmap|drawable)-(ldpi|mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)$/;
const PRUNABLE =
  /^(ic_launcher|ic_launcher_round|ic_launcher_foreground|ic_launcher_monochrome|splashscreen_logo)\.(png|webp)$/;
const KEEP = "-xxxhdpi";

/**
 * Deletes the redundant launcher and splash rasters below xxxhdpi from a
 * generated Android project. Only direct files inside density directories are
 * touched; `nodpi`, `anydpi`, `values`, `xml` and unrelated filenames survive.
 * Idempotent, because a build can reuse an already-pruned `android/` tree.
 *
 * @param {string} androidRoot Path to the generated `android/` directory.
 * @returns {{ files: number, bytes: number }} Files and raw bytes removed.
 */
export function pruneExtraDensities(androidRoot) {
  const res = path.join(androidRoot, "app", "src", "main", "res");
  if (!existsSync(res)) return { files: 0, bytes: 0 };

  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(res, { withFileTypes: true })) {
    if (!entry.isDirectory() || !DENSITY.test(entry.name) || entry.name.endsWith(KEEP)) {
      continue;
    }
    const dir = path.join(res, entry.name);
    for (const child of readdirSync(dir, { withFileTypes: true })) {
      if (!child.isFile() || !PRUNABLE.test(child.name)) continue;
      const target = path.join(dir, child.name);
      bytes += statSync(target).size;
      rmSync(target, { force: true });
      files += 1;
    }
  }
  return { files, bytes };
}
