import test from "node:test";
import assert from "node:assert/strict";
import { createAvatarReferenceIndex } from "./avatarReferences.ts";

const oldUrl = "https://cdn.example.test/avatar-old";
const newUrl = "https://cdn.example.test/avatar-new";

test("a self avatar reference follows URL replacement", () => {
  const removed = [];
  const index = createAvatarReferenceIndex((uri) => removed.push(uri));

  index.sync("self", [{ id: "self", uri: oldUrl }]);
  assert.equal(index.isReferenced(oldUrl), true);
  index.sync("self", [{ id: "self", uri: newUrl }]);

  assert.equal(index.isReferenced(oldUrl), false);
  assert.equal(index.isReferenced(newUrl), true);
  assert.deepEqual(removed, [oldUrl]);
});

test("a replaced URL is preserved while another user still references it", () => {
  const removed = [];
  const index = createAvatarReferenceIndex((uri) => removed.push(uri));

  index.sync("chats", [
    { id: "alice", uri: oldUrl },
    { id: "bob", uri: oldUrl },
  ]);
  index.sync("chats", [
    { id: "alice", uri: newUrl },
    { id: "bob", uri: oldUrl },
  ]);

  assert.equal(index.isReferenced(oldUrl), true);
  assert.deepEqual(removed, []);
  index.sync("chats", [{ id: "alice", uri: newUrl }]);
  assert.equal(index.isReferenced(oldUrl), false);
  assert.deepEqual(removed, [oldUrl]);
});

test("a cached self URL remains referenced by a story owner", () => {
  const removed = [];
  const index = createAvatarReferenceIndex((uri) => removed.push(uri));

  index.sync("self", [{ id: "self", uri: newUrl }]);
  index.sync("stories", [{ id: "story-owner", uri: newUrl }]);
  index.sync("self", []);

  assert.equal(index.isReferenced(newUrl), true);
  assert.deepEqual(removed, []);
  index.sync("stories", []);
  assert.deepEqual(removed, [newUrl]);
});
