import assert from "node:assert/strict";
import test from "node:test";
import {
  createForward,
  deleteFromThread,
  localChatPreview,
  messagePreview,
  refreshChatPreview,
} from "../src/domain/messageActions.ts";

const chat = {
  id: "target",
  name: "Target",
  avatar: "avatar",
  color: "white",
  preview: "old",
  time: "09:00",
  unread: 3,
};
const own = {
  id: "own",
  text: "secret",
  mine: true,
  time: "10:00",
  createdAt: "2026-10-18T10:00:00Z",
  uri: "private",
  kind: "video",
  reaction: "heart",
  forwarded: true,
  filename: "private.mp4",
  replyTo: { id: "parent", text: "parent secret", mine: false },
};
const incoming = { id: "incoming", text: "hello", mine: false, time: "10:01" };

test("everyone deletion retains only identity and timestamps and redacts reply snapshots", () => {
  const reply = {
    ...incoming,
    replyTo: { id: own.id, text: own.text, kind: "video", mine: true },
  };
  const thread = [own, reply];
  const result = deleteFromThread(thread, own.id, true);
  assert.deepEqual(result[0], {
    id: own.id,
    mine: true,
    time: own.time,
    createdAt: own.createdAt,
    deleted: true,
  });
  assert.deepEqual(result[1].replyTo, {
    id: own.id,
    mine: true,
    text: "Message deleted",
  });
  assert.equal(thread[0].text, "secret");
  assert.equal(thread[1].replyTo.text, "secret");
  assert.equal(messagePreview(result[0]), "Message deleted");
});

test("everyone deletion refuses other people's messages and unknown ids", () => {
  const thread = [own, incoming];
  assert.equal(deleteFromThread(thread, incoming.id, true), thread);
  assert.equal(deleteFromThread(thread, "missing", true), thread);
});

test("delete for me removes only that message and restores latest preview/time", () => {
  const reply = {
    ...incoming,
    replyTo: { id: own.id, text: "secret", mine: true },
  };
  const result = deleteFromThread([own, reply], own.id, false);
  assert.deepEqual(result, [reply]);
  assert.equal(result[0], reply);
  const updated = refreshChatPreview(chat, result);
  assert.equal(updated.preview, "hello");
  assert.equal(updated.time, reply.time);
  assert.equal(updated.unread, 3);
  assert.deepEqual(refreshChatPreview(chat, []), {
    ...chat,
    preview: "No messages yet",
    time: "",
    unread: 0,
  });
});

test("forward copies each payload with a new identity and no reply/deletion/reaction", () => {
  for (const payload of [
    { text: "hello" },
    { kind: "image", uri: "image" },
    { kind: "video", uri: "video" },
    { kind: "audio", uri: "audio", duration: 12 },
    { kind: "file", uri: "file", filename: "report.pdf" },
  ]) {
    const source = { ...own, ...payload, mine: false, deleted: false };
    const result = createForward(source, chat, "new", "11:00", "now");
    const { replyTo, deleted, reaction, ...rest } = source;
    assert.deepEqual(result, {
      ...rest,
      id: "new",
      time: "11:00",
      createdAt: "now",
      mine: true,
      forwarded: true,
    });
    assert.notEqual(result, source);
    assert.equal(source.reaction, "heart");
  }
});

test("deleted messages and blocked targets cannot be forwarded", () => {
  const tombstone = deleteFromThread([own], own.id, true)[0];
  assert.equal(createForward(tombstone, chat, "new", "now", "now"), null);
  assert.equal(
    createForward(own, { ...chat, blocked: true }, "new", "now", "now"),
    null,
  );
});

test("previews describe videos and the actual latest message", () => {
  assert.equal(messagePreview(own), "You: Sent a video");
  assert.equal(
    refreshChatPreview(chat, [incoming, own]).preview,
    "You: Sent a video",
  );
  assert.equal(refreshChatPreview(chat, [incoming, own]).time, own.time);
});

test("local previews keep the latest send state for delete-time reconciliation", () => {
  assert.deepEqual(localChatPreview([]), {
    preview: "No messages yet",
    time: "",
    lastMessageAt: undefined,
    lastMessageStatus: undefined,
  });
  const failed = {
    id: "pending",
    text: "Later",
    mine: true,
    time: "10:05",
    createdAt: "2026-10-18T10:05:00Z",
    status: "failed",
  };
  assert.deepEqual(localChatPreview([incoming, failed]), {
    preview: "You: Later",
    time: "10:05",
    lastMessageAt: Date.parse(failed.createdAt),
    lastMessageStatus: "failed",
  });
  assert.equal(localChatPreview([incoming]).preview, "hello");
  assert.equal(
    localChatPreview([{ ...incoming, createdAt: "not a date" }]).lastMessageAt,
    undefined,
  );
});
