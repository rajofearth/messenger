import test from "node:test";
import assert from "node:assert/strict";
import {
  deleteOptions,
  messageSummary,
  replySnapshot,
  withReply,
} from "./conversationModel.ts";

const original = { id: "first", text: "Original", mine: false, time: "10:00" };

test("replying to a reply snapshots the selected message, not its parent", () => {
  const target = {
    id: "second",
    text: "A reply",
    mine: true,
    time: "10:01",
    replyTo: replySnapshot(original),
  };
  const reply = replySnapshot(target);
  assert.deepEqual(reply, { id: "second", text: "A reply", mine: true });
  target.text = "Changed later";
  assert.equal(reply.text, "A reply");
});

test("text, image, video, file, and audio sends preserve independent reply snapshots", () => {
  const reply = replySnapshot(original);
  for (const partial of [
    { text: "Hello" },
    { kind: "image", uri: "photo" },
    { kind: "video", uri: "video" },
    { kind: "file", uri: "file", filename: "report.pdf" },
    { kind: "audio", uri: "voice", duration: 2 },
  ]) {
    const sent = withReply(partial, reply);
    assert.deepEqual(sent, { ...partial, replyTo: reply });
    assert.notEqual(sent.replyTo, reply);
  }
  assert.deepEqual(withReply({ text: "No reply" }, null), { text: "No reply" });
});

test("media snapshots have readable fallbacks without including nested reply or URI", () => {
  for (const [kind, text] of [
    ["image", "Photo"],
    ["video", "Video"],
    ["audio", "Voice note"],
    ["file", "File"],
  ]) {
    assert.deepEqual(
      replySnapshot({ ...original, text: undefined, kind, uri: "private" }),
      { id: original.id, text, mine: false, kind },
    );
  }
  assert.equal(
    messageSummary({ kind: "file", filename: "report.pdf" }),
    "report.pdf",
  );
  assert.equal(
    messageSummary({ deleted: true, text: "Hidden" }),
    "Deleted message",
  );
});

test("own deletion offers three choices and dispatches exact callback arguments", () => {
  const calls = [];
  const options = deleteOptions({ ...original, mine: true }, (...args) =>
    calls.push(args),
  );
  assert.deepEqual(
    options.map((option) => option.text),
    ["Delete for me", "Delete for everyone", "Cancel"],
  );
  options[0].onPress();
  options[1].onPress();
  assert.deepEqual(calls, [
    [original.id, false],
    [original.id, true],
  ]);
  assert.equal(options[2].onPress, undefined);
});

test("received messages never offer deletion for everyone", () => {
  const calls = [];
  const options = deleteOptions(original, (...args) => calls.push(args));
  assert.deepEqual(
    options.map((option) => option.text),
    ["Delete for me", "Cancel"],
  );
  options[0].onPress();
  assert.deepEqual(calls, [[original.id, false]]);
});
