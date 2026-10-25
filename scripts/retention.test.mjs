import test from "node:test";
import assert from "node:assert/strict";
import {
  addMessageRef,
  removeMessageRef,
  shouldDeleteBlob,
} from "../convex/lib/retention.ts";

test("add appends a message id once and is idempotent", () => {
  const refs = addMessageRef([], "m1");
  assert.deepEqual(refs, ["m1"]);
  assert.deepEqual(addMessageRef(refs, "m1"), ["m1"]);
  assert.deepEqual(addMessageRef(refs, "m2"), ["m1", "m2"]);
  // The stored list is replaced, never mutated in place.
  assert.deepEqual(refs, ["m1"]);
});

test("legacy rows stay undefined on add and remove", () => {
  assert.equal(addMessageRef(undefined, "m1"), undefined);
  assert.equal(removeMessageRef(undefined, "m1"), undefined);
});

test("remove drops one id and the last removal yields an empty list", () => {
  assert.deepEqual(removeMessageRef(["m1", "m2"], "m1"), ["m2"]);
  assert.deepEqual(removeMessageRef(["m1"], "m1"), []);
  assert.deepEqual(removeMessageRef(["m1"], "unknown"), ["m1"]);
});

test("only a defined empty list may delete a blob", () => {
  assert.equal(shouldDeleteBlob([]), true);
  assert.equal(shouldDeleteBlob(["a"]), false);
  assert.equal(shouldDeleteBlob(undefined), false);
});
