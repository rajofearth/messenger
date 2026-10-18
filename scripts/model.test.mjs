import test from "node:test";
import assert from "node:assert/strict";
import {
  filterConversations,
  unreadConversations,
  formatDuration,
  markChatRead,
  updateChatPreview,
} from "../src/domain/model.ts";

const fixture = () => [
  {
    id: "a",
    name: "Eleanor",
    preview: "Hello",
    time: "10:00",
    unread: 2,
    typing: true,
    avatar: "",
    color: "",
  },
  {
    id: "b",
    name: "Friends",
    preview: "Welcome",
    time: "09:00",
    unread: 0,
    group: true,
    avatar: "",
    color: "",
  },
];
test("empty search preserves private/group tabs, typed search crosses both tabs", () => {
  const chats = fixture();
  assert.deepEqual(
    filterConversations(chats, "  ", "private").map((c) => c.id),
    ["a"],
  );
  assert.deepEqual(
    filterConversations(chats, "", "group").map((c) => c.id),
    ["b"],
  );
  assert.deepEqual(
    filterConversations(chats, " FRIENDS ", "private").map((c) => c.id),
    ["b"],
  );
  assert.deepEqual(
    filterConversations(chats, "hello", "group").map((c) => c.id),
    ["a"],
  );
  assert.equal(filterConversations(chats, "no match", "private").length, 0);
});
test("unread counts exclude zero and keep private/group counts separate", () => {
  assert.equal(unreadConversations(fixture(), "private"), 1);
  assert.equal(unreadConversations(fixture(), "group"), 0);
  assert.equal(unreadConversations(markChatRead(fixture(), "a"), "private"), 0);
});

const update = (patch = {}) => ({
  id: "b",
  preview: "New message",
  time: "12:00",
  mine: false,
  openChatId: null,
  ...patch,
});

test("incoming messages in a closed chat increment unread and move it to the top", () => {
  const original = fixture();
  const result = updateChatPreview(original, update());
  assert.equal(result[0].id, "b");
  assert.equal(result[0].unread, 1);
  assert.equal(result[0].preview, "New message");
  assert.equal(result[0].group, true);
  assert.equal(original[1].unread, 0);
});
test("a reply after leaving the chat is unread, even if another chat is open", () => {
  const result = updateChatPreview(
    fixture(),
    update({ id: "a", openChatId: "b" }),
  );
  assert.equal(result[0].unread, 3);
  assert.equal(result[0].typing, false);
});
test("messages received in the open chat are read", () => {
  assert.equal(
    updateChatPreview(fixture(), update({ id: "a", openChatId: "a" }))[0]
      .unread,
    0,
  );
});
test("outgoing messages update the preview without adding unread", () => {
  const result = updateChatPreview(fixture(), update({ id: "a", mine: true }));
  assert.equal(result[0].unread, 0);
  assert.equal(result[0].time, "12:00");
  assert.equal(result[0].typing, false);
});
test("opening a conversation clears only its unread count and preserves ordering", () => {
  const result = markChatRead(fixture(), "a");
  assert.deepEqual(
    result.map((c) => c.id),
    ["a", "b"],
  );
  assert.equal(result[0].unread, 0);
  assert.equal(result[1].unread, 0);
});
test("unknown conversations do not mutate the chat list", () => {
  const original = fixture();
  assert.equal(
    updateChatPreview(original, update({ id: "missing" })),
    original,
  );
});
test("call and recording durations handle minute boundaries and invalid input", () => {
  assert.equal(formatDuration(0), "00:00");
  assert.equal(formatDuration(59), "00:59");
  assert.equal(formatDuration(60), "01:00");
  assert.equal(formatDuration(754), "12:34");
  assert.equal(formatDuration(-1), "00:00");
  assert.equal(formatDuration(NaN), "00:00");
});
