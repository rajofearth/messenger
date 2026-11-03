import test from "node:test";
import assert from "node:assert/strict";
import {
  directKey,
  groupTitle,
  isMember,
  uniqueMembers,
} from "../convex/lib/conversations.ts";

test("a direct key is the same whichever side starts the chat", () => {
  assert.equal(directKey("alice", "bob"), "direct:alice:bob");
  assert.equal(directKey("bob", "alice"), "direct:alice:bob");
});

test("uniqueMembers keeps insertion order and drops duplicates", () => {
  assert.deepEqual(uniqueMembers(["b", "a", "b", "c", "a"]), ["b", "a", "c"]);
  assert.deepEqual(uniqueMembers([]), []);
  // The caller's array is never mutated in place.
  const ids = ["a", "a"];
  uniqueMembers(ids);
  assert.deepEqual(ids, ["a", "a"]);
});

test("an empty or blank title falls back to a default group name", () => {
  assert.equal(groupTitle("  Weekends  "), "Weekends");
  assert.equal(groupTitle(""), "New group");
  assert.equal(groupTitle("   "), "New group");
});

test("membership is an exact subject id match", () => {
  assert.equal(isMember(["a", "b"], "b"), true);
  assert.equal(isMember(["a", "b"], "c"), false);
  assert.equal(isMember([], "a"), false);
});
