import test from "node:test";
import assert from "node:assert/strict";
import {
  appendUniqueStoryAssets,
  formatStoryDuration,
  storySelectionOrder,
  toggleStorySelection,
} from "./storyPickerModel.ts";

test("story selection keeps the tap order and removes in place", () => {
  const first = toggleStorySelection([], "a");
  const second = toggleStorySelection(first, "b");
  const third = toggleStorySelection(second, "c");
  assert.deepEqual(third, ["a", "b", "c"]);
  assert.deepEqual(toggleStorySelection(third, "b"), ["a", "c"]);
  assert.equal(storySelectionOrder(third, "a"), 1);
  assert.equal(storySelectionOrder(third, "c"), 3);
  assert.equal(storySelectionOrder(third, "missing"), 0);
});

test("story selection stops at the limit without reordering", () => {
  const full = ["a", "b"];
  assert.deepEqual(toggleStorySelection(full, "c", 2), ["a", "b"]);
  assert.deepEqual(toggleStorySelection(full, "a", 2), ["b"]);
});

test("story video duration formats as minutes and seconds", () => {
  assert.equal(formatStoryDuration(null), "");
  assert.equal(formatStoryDuration(0), "");
  assert.equal(formatStoryDuration(5_000), "0:05");
  assert.equal(formatStoryDuration(65_000), "1:05");
  assert.equal(formatStoryDuration(3_600_000), "60:00");
});

test("story media pages do not repeat an id", () => {
  const current = [{ id: "a" }, { id: "b" }];
  const next = [{ id: "b" }, { id: "c" }, { id: "c" }];
  assert.deepEqual(appendUniqueStoryAssets(current, next), [
    { id: "a" },
    { id: "b" },
    { id: "c" },
  ]);
});
