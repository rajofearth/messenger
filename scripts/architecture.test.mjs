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
  const nativeDirectories = [
    "modules/keyboard-media/android/src",
    "modules/system-notifications/android/src",
  ].map((directory) => path.join(root, directory));
  function nativeSources(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory()
        ? nativeSources(file)
        : file.endsWith(".kt")
          ? [file]
          : [];
    });
  }
  for (const file of [
    ...files,
    ...nativeDirectories.flatMap(nativeSources),
  ]) {
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
test("every test file is registered in the npm test script", () => {
  const ignored = new Set(["node_modules", "build", ".gradle", ".expo"]);
  function testFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (ignored.has(entry.name)) return [];
      const file = path.join(directory, entry.name);
      return entry.isDirectory()
        ? testFiles(file)
        : /\.test\.(?:mjs|cjs|js|jsx|ts|tsx)$/.test(file)
          ? [file]
          : [];
    });
  }
  const relative = (file) => path.relative(root, file).split(path.sep).join("/");
  const discovered = new Set(
    ["scripts", "src", "modules"]
      .map((directory) => path.join(root, directory))
      .flatMap(testFiles)
      .map(relative),
  );
  const { test: testScript } = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  ).scripts;
  const registered = new Set(
    testScript.split(/\s+/).filter((entry) => entry.includes(".test.")),
  );
  for (const file of discovered) {
    assert.ok(
      registered.has(file),
      `${file} is not in the npm test script, so it never runs`,
    );
  }
  for (const entry of registered) {
    assert.ok(discovered.has(entry), `npm test lists ${entry}, which does not exist`);
  }
});
test("application sources contain no type escapes", () => {
  for (const file of files) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /:\s*any\b|\bas\s+any\b|<any>|@ts-(?:ignore|nocheck)\b/,
      `${path.relative(root, file)} uses any or a TypeScript escape hatch; write the real type`,
    );
  }
});
test("application sources ship no debug logging", () => {
  for (const file of files) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /\bconsole\.log\b/,
      `${path.relative(root, file)} contains console.log; remove it before shipping`,
    );
  }
});
