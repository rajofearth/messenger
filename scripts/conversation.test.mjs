import test from "node:test";
import assert from "node:assert/strict";
import {
  replySnapshot,
  withReply,
  messageSummary,
  deleteOptions,
} from "../src/features/conversations/conversationModel.ts";
const original = {
  id: "one",
  text: "First message",
  mine: false,
  time: "12:00",
};
test("a reply to a reply references the selected message rather than its parent", () => {
  const second = {
    id: "two",
    text: "Second message",
    mine: true,
    time: "12:01",
    replyTo: replySnapshot(original),
  };
  const third = withReply({ text: "Third message" }, replySnapshot(second));
  assert.equal(third.replyTo.id, "two");
  assert.equal(third.replyTo.text, "Second message");
  assert.equal(third.replyTo.replyTo, undefined);
});
test("reply snapshots work for video, audio, image, and document messages", () => {
  for (const [kind, text] of [
    ["video", "Video"],
    ["audio", "Voice note"],
    ["image", "Photo"],
    ["file", "File"],
  ]) {
    const reply = replySnapshot({ ...original, text: undefined, kind });
    assert.equal(reply.kind, kind);
    assert.equal(reply.text, text);
    assert.equal(
      withReply({ kind, uri: "file:///media" }, reply).replyTo.id,
      original.id,
    );
  }
});
test("reply payloads do not share mutable snapshot objects with composer state", () => {
  const reply = replySnapshot(original);
  const sent = withReply({ text: "Reply" }, reply);
  reply.text = "Changed";
  assert.equal(sent.replyTo.text, original.text);
  assert.deepEqual(withReply({ text: "No reply" }, null), { text: "No reply" });
});
test("only outgoing messages offer delete for everyone and cancellation has no action", () => {
  const actions = [];
  const options = deleteOptions({ ...original, mine: true }, (...args) =>
    actions.push(args),
  );
  assert.deepEqual(
    options.map((option) => option.text),
    ["Delete for me", "Delete for everyone", "Cancel"],
  );
  options[0].onPress();
  options[1].onPress();
  assert.deepEqual(actions, [
    ["one", false],
    ["one", true],
  ]);
  assert.equal(options[2].onPress, undefined);
  assert.deepEqual(
    deleteOptions(original, () => {}).map((option) => option.text),
    ["Delete for me", "Cancel"],
  );
});
test("deleted content is never exposed in reply summaries", () => {
  assert.equal(
    messageSummary({ ...original, deleted: true }),
    "Deleted message",
  );
});
