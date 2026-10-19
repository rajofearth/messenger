import test from "node:test";
import assert from "node:assert/strict";
import { resolveDark } from "./theme.ts";

test("a pinned theme overrides the device scheme", () => {
  assert.equal(resolveDark("dark", "light"), true);
  assert.equal(resolveDark("dark", "dark"), true);
  assert.equal(resolveDark("light", "dark"), false);
  assert.equal(resolveDark("light", "light"), false);
});

test("the system theme follows the device scheme", () => {
  assert.equal(resolveDark("system", "dark"), true);
  assert.equal(resolveDark("system", "light"), false);
});

test("an unknown device scheme keeps the light palette", () => {
  assert.equal(resolveDark("system", "unspecified"), false);
  assert.equal(resolveDark("system", null), false);
  assert.equal(resolveDark("system", undefined), false);
});
