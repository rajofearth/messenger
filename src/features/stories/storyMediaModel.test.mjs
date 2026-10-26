import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("./storyMediaModel.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
new Function("exports", compiled)(exports);

test("story review mounts a video surface only for an active settled video page", () => {
  const shouldMount = exports.shouldMountStoryVideoSurface;

  assert.equal(shouldMount(true, false, false), false);
  assert.equal(shouldMount(true, true, false), false);
  assert.equal(shouldMount(true, false, true), false);
  assert.equal(shouldMount(true, true, true), true);
  assert.equal(shouldMount(false, true, true), false);
  assert.equal(shouldMount(undefined, true, true), false);
});
