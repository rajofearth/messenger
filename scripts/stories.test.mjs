import test from "node:test";
import assert from "node:assert/strict";
import { groupStories, isStoryReady, markOwnStories, mergeStoryUploads } from "../src/domain/stories.ts";

const story = (id, values = {}) => ({
  id,
  name: "Ada",
  avatar: "ada.jpg",
  image: `${id}.jpg`,
  seen: false,
  caption: "",
  ...values,
});

test("empty input has no owners", () => {
  assert.deepEqual(groupStories([]), []);
});

test("groups preserve first owner insertion and item array order", () => {
  const items = [
    story("a1"),
    story("b1", { avatar: "bea.jpg", name: "Bea" }),
    story("a2"),
  ];
  const groups = groupStories(items);
  assert.deepEqual(
    groups.map((group) => group.id),
    ["ada.jpg", "bea.jpg"],
  );
  assert.deepEqual(groups[0].items, [items[0], items[2]]);
  assert.equal(groups[0].name, "Ada");
  assert.equal(groups[0].avatar, "ada.jpg");
});

test("self fallback ignores changes to own avatar", () => {
  const groups = groupStories([
    story("s1", { name: "You", avatar: "old.jpg" }),
    story("a"),
    story("s2", { name: "You", avatar: "new.jpg" }),
    story("s3", { name: "You", ownerId: "self" }),
  ]);
  assert.deepEqual(
    groups[0].items.map((item) => item.id),
    ["s1", "s2", "s3"],
  );
  assert.equal(groups[0].id, "self");
  assert.equal(groups.length, 2);
});

test("explicit owner IDs take precedence over name and avatar", () => {
  const groups = groupStories([
    story("a", { ownerId: "owner" }),
    story("b", {
      ownerId: "owner",
      name: "Renamed",
      avatar: "changed.jpg",
      video: true,
    }),
    story("c", { ownerId: "other" }),
    story("d", { ownerId: "account", name: "You" }),
  ]);
  assert.deepEqual(
    groups.map((group) => group.id),
    ["owner", "other", "account"],
  );
  assert.equal(groups[0].items[1].video, true);
});

test("fallback owner identity uses avatar, not display name", () => {
  const groups = groupStories([
    story("a"),
    story("b", { name: "Renamed" }),
    story("c", { avatar: "other.jpg" }),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].items.length, 2);
});

test("group is seen only when all its items are seen", () => {
  assert.equal(
    groupStories([story("a", { seen: true }), story("b")])[0].seen,
    false,
  );
  assert.equal(
    groupStories([story("a", { seen: true }), story("b", { seen: true })])[0]
      .seen,
    true,
  );
});

test("grouping does not mutate input, sort, or clone story objects", () => {
  const first = Object.freeze(story("z"));
  const second = Object.freeze(story("a"));
  const input = Object.freeze([first, second]);
  const groups = groupStories(input);
  assert.notEqual(groups[0].items, input);
  assert.equal(groups[0].items[0], first);
  assert.equal(groups[0].items[1], second);
  assert.deepEqual(
    input.map((item) => item.id),
    ["z", "a"],
  );
});

test("deleting an item or an entire owner leaves valid groups", () => {
  const items = [
    story("s1", { name: "You" }),
    story("a"),
    story("s2", { name: "You" }),
  ];
  assert.deepEqual(
    groupStories(items.filter((item) => item.id !== "s1"))
      .find((group) => group.id === "self")
      .items.map((item) => item.id),
    ["s2"],
  );
  assert.deepEqual(
    groupStories(items.filter((item) => item.name !== "You")).map(
      (group) => group.id,
    ),
    ["ada.jpg"],
  );
});

test("the account's server stories join the pinned self group", () => {
  const items = [
    story("mine", { ownerId: "account", name: "Yash" }),
    story("theirs", { ownerId: "friend" }),
  ];
  const marked = markOwnStories(items, "account");
  assert.equal(marked[0].ownerId, "self");
  assert.equal(marked[0].name, "You");
  assert.equal(items[0].ownerId, "account");
  assert.equal(marked[1], items[1]);
  assert.equal(markOwnStories(items, "someone-else"), items);
  assert.deepEqual(
    groupStories(marked).map((group) => group.id),
    ["self", "friend"],
  );
});

test("local uploads are shown until the server returns the same story", () => {
  const server = [story("a")];
  const pending = [
    story("local-1", { ownerId: "self", name: "You" }),
    story("local-2", { ownerId: "self", name: "You" }),
  ];
  assert.deepEqual(mergeStoryUploads(server, pending), [...server, ...pending]);
  const confirmed = [story("a"), story("local-1")];
  assert.deepEqual(mergeStoryUploads(confirmed, pending), [
    ...confirmed,
    pending[1],
  ]);
  assert.equal(mergeStoryUploads(server, []), server);
});

test("pending story uploads are status cards, not playable stories", () => {
  const base = story("pending");
  assert.equal(isStoryReady({ ...base, uploadStatus: "uploading" }), false);
  assert.equal(isStoryReady({ ...base, uploadStatus: "failed" }), false);
  assert.equal(isStoryReady({ ...base, uploadStatus: "uploaded" }), true);
  assert.equal(isStoryReady(base), true);
});
