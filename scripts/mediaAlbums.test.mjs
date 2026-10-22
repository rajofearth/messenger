import test from "node:test";
import assert from "node:assert/strict";
import { groupMediaMessages, albumOverflowCount } from "../src/domain/mediaAlbums.ts";

const start = Date.parse("2026-10-18T12:00:00Z");
function photo(id, seconds = 0, extra = {}) {
  return { id: String(id), mine: true, kind: "image", uri: `file:///${id}.jpg`,
    time: "12:00", createdAt: new Date(start + seconds * 1000).toISOString(), ...extra };
}
const types = (messages) => groupMediaMessages(messages).map((row) => row.type);

test("consecutive images and videos group at the inclusive two-minute boundary", () => {
  const messages = [photo(1), photo(2, 120, { kind: "video" }), photo(3, 240)];
  const rows = groupMediaMessages(messages);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, "album");
  assert.equal(rows[0].id, "1");
  assert.deepEqual(rows[0].messages, messages);
  assert.deepEqual(types([photo(1), photo(2, 120.001)]), ["message", "message"]);
  assert.deepEqual(types([photo(1, 10), photo(2, 0)]), ["message", "message"]);
});

test("sender changes and text, file, audio, deleted and forwarded gaps break albums", () => {
  for (const extra of [
    { mine: false }, { kind: undefined, text: "gap" }, { kind: "file" },
    { kind: "audio" }, { deleted: true }, { forwarded: true },
  ]) {
    const messages = [photo(1), photo(2, 1, extra), photo(3, 2)];
    assert.deepEqual(types(messages), ["message", "message", "message"]);
  }
});

test("pending and failed media keep their own bubble for status and retry", () => {
  for (const status of ["sending", "failed", "sent"]) {
    assert.deepEqual(
      types([photo(1, 0, { status }), photo(2, 1)]),
      ["message", "message"],
    );
  }
  assert.deepEqual(types([photo(1), photo(2, 1)]), ["album"]);
});

test("reply targets must match, including absence of a reply", () => {
  const replyTo = { id: "parent", text: "original", mine: false };
  assert.deepEqual(types([photo(1, 0, { replyTo }), photo(2, 1, { replyTo })]), ["album"]);
  for (const reply of [undefined, { ...replyTo, id: "other" }])
    assert.deepEqual(types([photo(1, 0, { replyTo }), photo(2, 1, { replyTo: reply })]), ["message", "message"]);
});

test("explicit matching IDs group without timestamps or across long time gaps", () => {
  for (const extra of [{ createdAt: undefined }, { createdAt: "invalid" }, { createdAt: "2020-01-01T00:00:00Z" }]) {
    assert.deepEqual(types([photo(1, 0, { albumId: "a" }), photo(2, 1, { albumId: "a", ...extra })]), ["album"]);
  }
  for (const albumId of [undefined, "b"])
    assert.deepEqual(types([photo(1, 0, { albumId: "a" }), photo(2, 1, { albumId })]), ["message", "message"]);
});

test("explicit IDs never bypass sender, reply, deleted, forwarded or contiguity guards", () => {
  for (const extra of [{ mine: false }, { deleted: true }, { forwarded: true },
    { replyTo: { id: "reply", text: "reply", mine: false } }])
    assert.deepEqual(types([photo(1, 0, { albumId: "a" }), photo(2, 1, { albumId: "a", ...extra })]), ["message", "message"]);
  const messages = [photo(1, 0, { albumId: "a" }), photo(2, 1, { kind: undefined }), photo(3, 2, { albumId: "a" })];
  assert.deepEqual(types(messages), ["message", "message", "message"]);
});

test("missing and invalid createdAt never use matching display time labels", () => {
  for (const createdAt of [undefined, "", "invalid"])
    assert.deepEqual(types([photo(1), photo(2, 0, { createdAt })]), ["message", "message"]);
});

test("GIF images remain individual even with explicit matching album IDs", () => {
  for (const albumId of [undefined, "a"])
    for (const mimeType of ["image/gif", "IMAGE/GIF", "image/gif; charset=binary"])
      assert.deepEqual(types([photo(1, 0, { albumId }), photo(2, 1, { albumId, mimeType }), photo(3, 2, { albumId })]), ["message", "message", "message"]);
});

test("URI-only GIFs stay standalone, including explicit albums and query strings", () => {
  for (const albumId of [undefined, "a"])
    for (const uri of [
      "file:///animation.gif", "content://media/animation.GIF",
      "https://example.com/animation.gif?token=abc.jpg",
      "https://example.com/animation.GIF#preview",
      "https://example.com/animation.gif?token=abc#preview",
    ])
      for (const mimeType of [undefined, "", "  "])
        assert.deepEqual(types([
          photo(1, 0, { albumId }), photo(2, 1, { albumId, uri, mimeType }),
          photo(3, 2, { albumId }),
        ]), ["message", "message", "message"], uri);
});

test("GIF fallback checks the path extension, not query or fragment text", () => {
  for (const uri of [
    undefined, "file:///photo.jpg", "https://example.com/photo.jpg?name=animation.gif",
    "https://example.com/photo.jpg#animation.gif", "file:///animation.gif.jpg",
  ])
    assert.deepEqual(types([photo(1), photo(2, 1, { uri })]), ["album"]);
  assert.deepEqual(types([
    photo(1), photo(2, 1, { uri: "file:///photo.gif", mimeType: "image/jpeg" }),
  ]), ["album"]);
});

test("fifty items retain their order and identity without mutating inputs", () => {
  const messages = Object.freeze(Array.from({ length: 50 }, (_, i) => Object.freeze(photo(i, i, { albumId: "fifty", kind: i % 2 ? "video" : "image" }))));
  const rows = groupMediaMessages(messages);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].messages.length, 50);
  rows[0].messages.forEach((message, index) => assert.equal(message, messages[index]));
  const larger = groupMediaMessages([...messages, photo(50, 50, { albumId: "fifty" })]);
  assert.equal(larger[0].messages.length, 50);
  assert.equal(larger[1].type, "message");
});

test("fourth-tile overflow includes the covered fourth item: 5 => +2, 50 => +47", () => {
  for (const count of [0, 1, 2, 3, 4]) assert.equal(albumOverflowCount(count), 0);
  assert.equal(albumOverflowCount(5), 2);
  assert.equal(albumOverflowCount(50), 47);
});

test("empty and singleton input return ordinary rows", () => {
  assert.deepEqual(groupMediaMessages([]), []);
  const message = photo(1);
  assert.deepEqual(groupMediaMessages([message]), [{ type: "message", message }]);
});
