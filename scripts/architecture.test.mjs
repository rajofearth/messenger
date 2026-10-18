import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sources(file)
      : /\.tsx?$/.test(file)
        ? [file]
        : [];
  });
}
const files = [path.join(root, "App.tsx"), ...sources(path.join(root, "src"))];
test("application source files stay under 500 lines", () => {
  for (const file of files) {
    const lines = readFileSync(file, "utf8").trimEnd().split("\n").length;
    assert.ok(
      lines <= 500,
      `${path.relative(root, file)} has ${lines} lines; extract a focused module`,
    );
  }
});
test("feature and domain modules never import the application entrypoint", () => {
  for (const file of files.filter(
    (file) => file !== path.join(root, "App.tsx"),
  )) {
    const code = readFileSync(file, "utf8");
    assert.doesNotMatch(
      code,
      /from\s+["'][^"']*\/App(?:\.tsx?)?["']/,
      path.relative(root, file),
    );
  }
});
test("domain model does not depend on React Native, storage, state hooks, or screens", () => {
  for (const file of sources(path.join(root, "src/domain"))) {
    const code = readFileSync(file, "utf8");
    assert.doesNotMatch(
      code,
      /from\s+["'](?:react|react-native|expo[^"']*|@react-native[^"']*|[^"']*(?:features|state|ui)\/)/,
      path.relative(root, file),
    );
  }
});
