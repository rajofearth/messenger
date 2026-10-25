// Shared discovery for the Ionicons subset. `subset-icon-font.mjs` builds the
// font and its stamp from these paths; `check-icon-glyphs.mjs` re-runs the same
// scan to prove the subset still covers every name the app can render.
//
// The module only reads the glyph map and the application sources, so importing
// it has no side effects and writes nothing.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

/** The font Expo bundles; the subset script rewrites it in place. */
export const FONT = path.join(
  root,
  "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf",
);
/** Ionicons name -> code point, shipped beside the font. */
export const MAP = path.join(
  root,
  "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json",
);
/** Pristine copy, so a second run never subsets an already-subset font. */
export const ORIGINAL = path.join(root, "node_modules/.ionicons-original.ttf");
/** Record of what the font currently carries. */
export const STAMP = path.join(root, "node_modules/.ionicons-subset.json");

// Glyph names reach Ionicons as string literals, e.g. name="chatbubble-ellipses".
// The quote backreference keeps prose and identifiers out of the match.
const LITERAL = /(["'`])([a-z0-9-]{2,40})\1/g;
const SOURCE = /\.(?:ts|tsx|js|jsx)$/;

/** Parses the shipped glyph map: Ionicons name -> code point. */
export function readGlyphMap() {
  return JSON.parse(readFileSync(MAP, "utf8"));
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return SOURCE.test(entry.name) ? [file] : [];
  });
}

/**
 * Every string literal that happens to be a glyph name, sorted. The scan is
 * over-inclusive on purpose: icon names also reach Ionicons through
 * `icon={...}` props, and following the prop graph is not worth it while the
 * subset stays this small.
 */
export function discoverGlyphs() {
  const known = new Set(Object.keys(readGlyphMap()));
  const files = [path.join(root, "App.tsx")];
  for (const directory of ["src", "app"]) {
    const full = path.join(root, directory);
    if (existsSync(full)) files.push(...sourceFiles(full));
  }
  const used = new Set();
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const [, , name] of readFileSync(file, "utf8").matchAll(LITERAL)) {
      if (known.has(name)) used.add(name);
    }
  }
  return [...used].sort();
}
