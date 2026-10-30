import test from "node:test";
import assert from "node:assert/strict";
import { isConfirmed, mergeOlderPage } from "./threadMerge.ts";

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

function pending(overrides = {}) {
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

test("confirmed rows carry a relay sequence; local sends do not", () => {
  assert.equal(isConfirmed(confirmed()), true);
  assert.equal(isConfirmed(pending()), false);
});

test("an older page never drops local history the page does not name", () => {
  const local = [
    confirmed({ id: "m3", sequence: 3 }),
    confirmed({ id: "m4", sequence: 4 }),
    confirmed({ id: "m5", sequence: 5 }),
  ];
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

test("an older page replaces the stored fields but keeps downloaded media", () => {
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
  const local = [confirmed({ id: "m9", sequence: 9 }), pending({ id: "local-9" })];
  const merged = mergeOlderPage(
    [confirmed({ id: "m8", sequence: 8 })],
    local,
  );
  assert.deepEqual(
    merged.map((message) => message.id),
    ["m8", "m9", "local-9"],
  );
});
