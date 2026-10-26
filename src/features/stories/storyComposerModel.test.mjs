import test from "node:test";
import assert from "node:assert/strict";
import { appendDrafts, dragTargetIndex, moveDraft, moveDraftTo, removeDraft, toggleDraftCrop } from "./storyComposerModel.ts";

const media = (uri) => ({ uri, video: false });

test("selected media and a later camera capture append in review order", () => {
  const first = appendDrafts([], [media("a"), media("b")], "first");
  const next = appendDrafts(first, [media("c"), media("a")], "camera");
  assert.deepEqual(next.map((item) => item.uri), ["a", "b", "c"]);
});

test("review order can move items and remove the current item", () => {
  const drafts = appendDrafts([], [media("a"), media("b"), media("c")], "seed");
  assert.deepEqual(moveDraft(drafts, 2, -1).map((item) => item.uri), ["a", "c", "b"]);
  assert.deepEqual(removeDraft(drafts, 1).map((item) => item.uri), ["a", "c"]);
  assert.deepEqual(moveDraftTo(drafts, 0, 2).map((item) => item.uri), ["b", "c", "a"]);
});

test("crop is a deliberate fit/fill framing toggle", () => {
  const draft = appendDrafts([], [media("a")], "seed")[0];
  assert.equal(draft.crop, "fit");
  assert.equal(toggleDraftCrop(draft).crop, "fill");
});

test("drag targets follow slot midpoints and clamp to the strip", () => {
  assert.equal(dragTargetIndex(1, 29, 60, 4), 1);
  assert.equal(dragTargetIndex(1, 31, 60, 4), 2);
  assert.equal(dragTargetIndex(1, -1000, 60, 4), 0);
  assert.equal(dragTargetIndex(1, 1000, 60, 4), 3);
});
