#!/usr/bin/env node
// Fails when the app can render an Ionicons name that the subset font does not
// carry: that name would draw as an empty square on the device. `npm test` runs
// this, and `npm run postinstall` fixes it.
//
// The check re-runs the same over-inclusive literal scan as the subset script,
// so a new icon name anywhere in App.tsx or src/ has to survive a fresh
// postinstall before it can ship.

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { FONT, STAMP, discoverGlyphs } from "./icon-glyphs.mjs";

// The subset is about 27 KB and the pristine font is 389,724 B, so this line
// cannot mistake the shipped font for a subset. It also leaves room for roughly
// 45 more icons before a legitimately grown subset trips it.
const MAX_SUBSET_BYTES = 40 * 1024;

/** Returns the subset's glyph count and byte size, or throws a fixable error. */
export function verifyIcons() {
  if (!existsSync(STAMP)) {
    throw new Error(
      `the Ionicons subset stamp is missing (${STAMP}); run npm run postinstall`,
    );
  }
  if (!existsSync(FONT)) {
    throw new Error(
      `the Ionicons font is missing (${FONT}); run npm run postinstall`,
    );
  }

  let stamp;
  try {
    stamp = JSON.parse(readFileSync(STAMP, "utf8"));
  } catch {
    throw new Error(
      `the Ionicons subset stamp is not valid JSON (${STAMP}); run npm run postinstall`,
    );
  }
  if (!Array.isArray(stamp?.glyphs)) {
    throw new Error(
      `the Ionicons subset stamp has no glyphs array (${STAMP}); run npm run postinstall`,
    );
  }

  const subset = new Set(stamp.glyphs);
  const missing = discoverGlyphs().filter((name) => !subset.has(name));
  if (missing.length > 0) {
    throw new Error(
      `the Ionicons subset is missing ${missing.length} glyph(s): ` +
        `${missing.join(", ")}; run npm run postinstall`,
    );
  }

  const { size } = statSync(FONT);
  if (size > MAX_SUBSET_BYTES) {
    throw new Error(
      `the Ionicons font is not subset (${size} B); run npm run postinstall`,
    );
  }
  return { glyphs: stamp.glyphs.length, bytes: size };
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isEntryPoint = entry === fileURLToPath(import.meta.url);

if (process.env.NODE_TEST_CONTEXT) {
  test("every discovered Ionicons glyph is in the subset font", () => {
    verifyIcons();
  });
} else if (isEntryPoint) {
  try {
    const { glyphs, bytes } = verifyIcons();
    console.log(`Ionicons glyph check: ${glyphs} glyphs, ${bytes} B`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
