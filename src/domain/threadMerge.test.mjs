import test from "node:test";
import assert from "node:assert/strict";
import {
  SERVER_MATCH_WINDOW_MS,
  isConfirmed,
  isPendingStatus,
  mergeChats,
  mergeOlderPage,
  mergeThread,
  newestReadSequence,
  sameOptimistic,
} from "./threadMerge.ts";

const sentAt = "2026-10-21T10:00:00.000Z";

function confirmed(overrides = {}) {
  return {
    id: "server-1",
    text: "Hello",
    mine: true,
    time: "10:00",
    createdAt: sentAt,
    sequence: 1,
    ...overrides,
  };
}

function optimistic(overrides = {}) {
  return {
    id: "local-1",
    text: "Hello",
    mine: true,
    time: "10:00",
    createdAt: sentAt,
    status: "sending",
    ...overrides,
  };
}

function chat(overrides = {}) {
  return {
    id: "chat-1",
    name: "Alex",
    avatar: "",
    preview: "You: Hello",
    time: "10:00",
    unread: 0,
    color: "#fff",
    ...overrides,
  };
}

test("optimistic sends match the server copy by payload and nearby time only", () => {
  assert.equal(sameOptimistic(confirmed(), optimistic()), true);
  for (const remote of [
    confirmed({ mine: false }),
    confirmed({ text: "Different" }),
    confirmed({ kind: "image", text: undefined }),
    confirmed({ deleted: true }),
    confirmed({ createdAt: undefined }),
  ]) {
    assert.equal(sameOptimistic(remote, optimistic()), false);
  }
  assert.equal(
    sameOptimistic(confirmed({ filename: "a.pdf" }), optimistic({ filename: "a.pdf" })),
    true,
  );
  assert.equal(
    sameOptimistic(confirmed({ filename: "a.pdf" }), optimistic()),
    true,
  );
});

test("matching tolerates a minute of clock skew and one match window forward", () => {
  const localAt = Date.parse(sentAt);
  const at = (offset) =>
    confirmed({ createdAt: new Date(localAt + offset).toISOString() });
  assert.equal(sameOptimistic(at(-60_000), optimistic()), true);
  assert.equal(sameOptimistic(at(-60_001), optimistic()), false);
  assert.equal(sameOptimistic(at(SERVER_MATCH_WINDOW_MS), optimistic()), true);
  assert.equal(sameOptimistic(at(SERVER_MATCH_WINDOW_MS + 1), optimistic()), false);
});

test("server rows are confirmed; local pending rows are not", () => {
  assert.equal(isConfirmed(confirmed()), true);
  assert.equal(isConfirmed(optimistic()), false);
  assert.equal(isPendingStatus("sending"), true);
  assert.equal(isPendingStatus("failed"), true);
  assert.equal(isPendingStatus("sent"), false);
  assert.equal(isPendingStatus(undefined), false);
});

test("merge keeps a downloaded local URI for a server row", () => {
  const local = confirmed({
    id: "server-1",
    uri: "file:///cached.jpg",
    kind: "image",
    text: undefined,
  });
  const remote = confirmed({
    id: "server-1",
    uri: "https://example.com/photo.jpg",
    kind: "image",
    text: undefined,
  });
  const [merged] = mergeThread([remote], [local]);
  assert.equal(merged.uri, "file:///cached.jpg");
  assert.equal(merged.sequence, 1);
});

test("merge keeps a cached preview without clearing the server's", () => {
  const cached = confirmed({
    id: "server-1",
    uri: "https://example.com/photo.jpg",
    kind: "image",
    text: undefined,
    previewUri: "file:///cached-w512.webp",
    previewWidth: 512,
  });
  const remote = confirmed({
    id: "server-1",
    uri: "https://example.com/photo.jpg",
    kind: "image",
    text: undefined,
  });
  const [merged] = mergeThread([remote], [cached]);
  assert.equal(merged.previewUri, "file:///cached-w512.webp");
  assert.equal(merged.previewWidth, 512);

  const serverPreview = confirmed({
    id: "server-1",
    uri: "https://example.com/photo.jpg",
    kind: "image",
    text: undefined,
    previewUri: "file:///older-w512.webp",
    previewWidth: 512,
  });
  const empty = confirmed({
    id: "server-1",
    uri: "https://example.com/photo.jpg",
    kind: "image",
    text: undefined,
  });
  const [kept] = mergeThread([serverPreview], [empty]);
  assert.equal(kept.previewUri, "file:///older-w512.webp");
  assert.equal(kept.previewWidth, 512);
});

test("a shorter server page keeps the older confirmed history", () => {
  const local = [
    confirmed({ id: "server-1", sequence: 1 }),
    confirmed({ id: "server-2", sequence: 2 }),
    confirmed({ id: "server-3", sequence: 3 }),
  ];
  const merged = mergeThread([confirmed({ id: "server-3", sequence: 3 })], local);
  assert.deepEqual(
    merged.map((message) => message.id),
    ["server-1", "server-2", "server-3"],
  );
  assert.deepEqual(
    merged.map((message) => message.sequence),
    [1, 2, 3],
  );
});

test("a confirmed row hidden inside the page range is not resurrected", () => {
  const local = [
    confirmed({ id: "server-1", sequence: 1 }),
    confirmed({ id: "server-2", sequence: 2 }),
    confirmed({ id: "server-3", sequence: 3 }),
  ];
  const remote = [
    confirmed({ id: "server-1", sequence: 1 }),
    confirmed({ id: "server-3", sequence: 3 }),
  ];
  assert.deepEqual(
    mergeThread(remote, local).map((message) => message.id),
    ["server-1", "server-3"],
  );
});

test("a confirmed row newer than a stale page stays at the end", () => {
  const local = [
    confirmed({ id: "server-3", sequence: 3 }),
    confirmed({ id: "server-4", sequence: 4 }),
  ];
  const remote = [
    confirmed({ id: "server-2", sequence: 2 }),
    confirmed({ id: "server-3", sequence: 3 }),
  ];
  assert.deepEqual(
    mergeThread(remote, local).map((message) => message.id),
    ["server-2", "server-3", "server-4"],
  );
});

test("an empty server page keeps the local confirmed history", () => {
  const local = [confirmed({ id: "server-1", sequence: 1 })];
  assert.deepEqual(
    mergeThread([], local).map((message) => message.id),
    ["server-1"],
  );
});

test("a matched optimistic bubble is replaced, an unmatched one stays", () => {
  const matched = optimistic();
  const second = optimistic({ id: "local-2", text: "Second" });
  const merged = mergeThread(
    [confirmed({ text: "Other" }), confirmed({ id: "server-2" })],
    [second, matched],
  );
  assert.deepEqual(
    merged.map((message) => message.id),
    ["server-1", "server-2", "local-2"],
  );
});

test("failed bubbles survive a server refresh, including one with newer rows", () => {
  const failed = optimistic({ id: "local-failed", status: "failed" });
  const newer = confirmed({
    id: "server-2",
    text: "Later message",
    createdAt: "2026-10-21T10:05:00.000Z",
    sequence: 2,
  });
  const merged = mergeThread([confirmed(), newer], [failed]);
  assert.equal(merged.length, 3);
  assert.equal(merged[2].id, "local-failed");
  assert.equal(merged[2].status, "failed");
});

test("a failed bubble is never hidden by an identical older server message", () => {
  const failed = optimistic({ id: "local-failed", status: "failed" });
  const merged = mergeThread([confirmed()], [failed]);
  assert.deepEqual(
    merged.map((message) => message.id),
    ["server-1", "local-failed"],
  );
});

test("an inbox row keeps an unconfirmed last send until the server catches up", () => {
  const local = chat({
    preview: "You: Pending",
    lastMessageAt: Date.parse(sentAt),
    lastMessageStatus: "failed",
  });
  const sameTime = chat({ lastMessageAt: Date.parse(sentAt), preview: "You: Old" });
  assert.deepEqual(mergeChats([sameTime], [local]), [local]);
  const older = chat({ lastMessageAt: Date.parse(sentAt) - 1, preview: "You: Old" });
  assert.deepEqual(mergeChats([older], [local]), [local]);
});

test("a newer server message clears the pending inbox state", () => {
  const local = chat({
    preview: "You: Pending",
    lastMessageAt: Date.parse(sentAt),
    lastMessageStatus: "sending",
  });
  const remote = chat({
    preview: "Reply",
    lastMessageAt: Date.parse(sentAt) + 1,
  });
  assert.deepEqual(mergeChats([remote], [local]), [remote]);
  assert.deepEqual(mergeChats([remote], []), [remote]);
});

test("a sent inbox row is not preserved; the server snapshot wins", () => {
  const local = chat({
    preview: "You: Sent",
    lastMessageAt: Date.parse(sentAt),
    lastMessageStatus: "sent",
  });
  const remote = chat({ preview: "You: Hello", lastMessageAt: Date.parse(sentAt) });
  assert.deepEqual(mergeChats([remote], [local]), [remote]);
});

test("the newest read sequence skips local-only sends and out-of-order rows", () => {
  const messages = [
    confirmed({ id: "server-1", sequence: 4 }),
    confirmed({ id: "server-2", sequence: 9 }),
    optimistic({ id: "local-1", sequence: undefined }),
  ];
  assert.equal(newestReadSequence(messages), 9);
  assert.equal(newestReadSequence([optimistic()]), undefined);
  assert.equal(newestReadSequence([]), undefined);
});

test("an older page never drops local history the server no longer has", () => {
  const local = [
    confirmed({ id: "m3", sequence: 3 }),
    confirmed({ id: "m4", sequence: 4 }),
    confirmed({ id: "m5", sequence: 5 }),
  ];
  // The relay purged sequence 3 after delivery; the phone still owns it.
  const page = [
    confirmed({ id: "m1", sequence: 1 }),
    confirmed({ id: "m2", sequence: 2 }),
    confirmed({ id: "m4", sequence: 4 }),
  ];
  assert.deepEqual(
    mergeOlderPage(page, local).map((message) => message.id),
    ["m1", "m2", "m3", "m4", "m5"],
  );
});

test("an older page replaces the server fields but keeps downloaded media", () => {
  const local = confirmed({
    id: "m7",
    sequence: 7,
    text: "old text",
    uri: "file:///media/m7.jpg",
    previewUri: "file:///media/m7-256.jpg",
    previewWidth: 256,
  });
  const page = confirmed({
    id: "m7",
    sequence: 7,
    text: "edited text",
    uri: "https://example.test/m7.jpg",
    reaction: "👍",
  });
  const [merged] = mergeOlderPage([page], [local]);
  assert.equal(merged.text, "edited text");
  assert.equal(merged.reaction, "👍");
  assert.equal(merged.uri, "file:///media/m7.jpg");
  assert.equal(merged.previewUri, "file:///media/m7-256.jpg");
  assert.equal(merged.previewWidth, 256);
});

test("an older page keeps pending sends at the end", () => {
  const pending = optimistic({ id: "local-9" });
  const merged = mergeOlderPage(
    [confirmed({ id: "m8", sequence: 8 })],
    [confirmed({ id: "m9", sequence: 9 }), pending],
  );
  assert.deepEqual(
    merged.map((message) => message.id),
    ["m8", "m9", "local-9"],
  );
});
