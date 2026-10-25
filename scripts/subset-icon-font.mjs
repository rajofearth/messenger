#!/usr/bin/env node
// Rewrites the Ionicons font that @expo/vector-icons ships so the APK only
// carries the glyphs the app can actually render (389,724 B -> 26,980 B, which
// deflates to about 15 KB inside the APK).
//
// `npm run postinstall` runs this after every install, which is what makes the
// in-place rewrite inside node_modules reproducible: the transform is
// deterministic and the stamp beside the pristine copy records what it kept.
//
// Every run starts from node_modules/.ionicons-original.ttf, never from the
// current font, because subsetting a subset loses every glyph the first pass
// dropped.

import fs from "node:fs";
import subsetFont from "subset-font";
import {
  FONT,
  ORIGINAL,
  STAMP,
  discoverGlyphs,
  readGlyphMap,
} from "./icon-glyphs.mjs";

// The pristine font is 389,724 B. Anything below this is a previous subset, and
// copying it as the original would silently drop glyphs that pass removed.
const MIN_ORIGINAL_BYTES = 100 * 1024;

function pristineFont() {
  if (!fs.existsSync(ORIGINAL)) {
    if (!fs.existsSync(FONT)) {
      throw new Error(`Ionicons is not installed (${FONT} is missing); run npm ci`);
    }
    const { size } = fs.statSync(FONT);
    if (size < MIN_ORIGINAL_BYTES) {
      throw new Error(
        `the pristine Ionicons font is missing (${ORIGINAL}) and ${FONT} is ` +
          `already a subset at ${size} B; reinstall @expo/vector-icons with npm ci`,
      );
    }
    fs.copyFileSync(FONT, ORIGINAL);
  }
  return fs.readFileSync(ORIGINAL);
}

async function main() {
  const glyphs = readGlyphMap();
  const used = discoverGlyphs();
  if (used.length === 0) {
    throw new Error("no Ionicons glyphs were discovered; the source scan is broken");
  }

  const chars = used.map((name) => String.fromCodePoint(glyphs[name])).join("");
  const original = pristineFont();
  const out = await subsetFont(original, chars, { targetFormat: "truetype" });

  fs.writeFileSync(FONT, out);
  fs.writeFileSync(
    STAMP,
    `${JSON.stringify({ glyphs: used, bytes: out.length }, null, 2)}\n`,
  );
  console.log(
    `Ionicons: ${used.length} glyphs, ${out.length} B (was ${original.length} B)`,
  );
}

try {
  await main();
} catch (error) {
  console.error(
    `Ionicons subset: ${error instanceof Error ? error.message : error}`,
  );
  process.exitCode = 1;
}
