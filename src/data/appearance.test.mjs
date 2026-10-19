import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAppearance } from "./appearance.ts";

test("the current appearance record keeps its theme", () => {
  assert.deepEqual(normalizeAppearance({ theme: "system" }), {
    theme: "system",
  });
  assert.deepEqual(normalizeAppearance({ theme: "dark" }), { theme: "dark" });
  assert.deepEqual(normalizeAppearance({ theme: "light" }), { theme: "light" });
});

test("records written before the system option keep their pinned theme", () => {
  assert.deepEqual(normalizeAppearance({ dark: true }), { theme: "dark" });
  assert.deepEqual(normalizeAppearance({ dark: false }), { theme: "light" });
});

test("missing or damaged appearance records are dropped", () => {
  assert.equal(normalizeAppearance(undefined), undefined);
  assert.equal(normalizeAppearance(null), undefined);
  assert.equal(normalizeAppearance({ theme: "sepia" }), undefined);
  assert.equal(normalizeAppearance({ dark: "yes" }), undefined);
  assert.equal(normalizeAppearance("dark"), undefined);
  assert.equal(normalizeAppearance({}), undefined);
});
