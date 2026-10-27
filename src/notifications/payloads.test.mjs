import test from "node:test";
import assert from "node:assert/strict";
import {
  NOTIFICATION_MESSAGE_LIMIT,
  callPayload,
  messageLabel,
  messagePayload,
  person,
} from "./payloads.ts";

const chat = {
  id: "1",
  name: " Eleanor Pena ",
  avatar: "https://images.unsplash.com/photo-1?w=200",
  preview: "That sounds like the perfect plan",
  time: "12:41",
  unread: 2,
  color: "#EBEEE4",
};

const message = (overrides) => ({
  id: "m1",
  mine: false,
  time: "12:41",
  ...overrides,
});

test("an incoming call asks for ringing controls but no call controls yet", () => {
  const payload = callPayload({
    callId: "call-1",
    chat,
    state: "incoming",
    video: true,
    muted: true,
    speaker: true,
    avatarUri: "file:///avatars/1.jpg",
    timeoutMs: 60_000,
  });
  assert.equal(payload.callId, "call-1");
  assert.equal(payload.state, "incoming");
  assert.equal(payload.video, true);
  assert.equal(payload.allowMute, false);
  assert.equal(payload.allowSpeaker, false);
  assert.equal(payload.muted, undefined);
  assert.equal(payload.speaker, undefined);
  assert.equal(payload.connectedAt, undefined);
  assert.equal(payload.timeoutMs, 60_000);
  // Outgoing calls ring on the other side, so they never carry an expiry here.
  assert.equal(
    callPayload({ callId: "call-2", chat, state: "outgoing", video: false })
      .timeoutMs,
    undefined,
  );
});

test("an ongoing call carries engine state, duration and the resolved avatar", () => {
  const payload = callPayload({
    callId: "call-3",
    chat,
    state: "ongoing",
    video: false,
    connectedAt: 1_700_000_000_000,
    muted: true,
    speaker: false,
    avatarUri: "file:///avatars/1.jpg",
    timeoutMs: 60_000,
  });
  assert.equal(payload.allowMute, true);
  assert.equal(payload.allowSpeaker, true);
  assert.equal(payload.muted, true);
  assert.equal(payload.speaker, false);
  assert.equal(payload.connectedAt, 1_700_000_000_000);
  assert.equal(payload.timeoutMs, undefined);
  assert.equal(payload.person.avatarUri, "file:///avatars/1.jpg");
});

test("a blank display name never reaches the system UI, and trimming is applied", () => {
  assert.equal(person("1", "   ").name, "Unknown");
  assert.equal(callPayload({ callId: "c", chat, state: "incoming", video: false }).person.name, "Eleanor Pena");
});

test("media messages get a readable label instead of an empty body", () => {
  assert.equal(messageLabel(message({ kind: "image", text: "  " })), "📷 Photo");
  assert.equal(messageLabel(message({ kind: "video" })), "🎬 Video");
  assert.equal(messageLabel(message({ kind: "audio" })), "🎤 Voice message");
  assert.equal(messageLabel(message({ kind: "file", filename: "plan.pdf" })), "📄 plan.pdf");
  assert.equal(messageLabel(message({ kind: "file" })), "📄 File");
  assert.equal(messageLabel(message({ deleted: true, text: "secret" })), "Message deleted");
  assert.equal(messageLabel(message({ text: "  hello  " })), "hello");
  assert.equal(messageLabel(message({ text: "   " })), "New message");
});

test("only incoming messages are announced, and none means no notification", () => {
  const silentChat = [
    message({ id: "a", mine: true, text: "Sent by me" }),
    message({ id: "b", mine: true, text: "Also me" }),
  ];
  assert.equal(
    messagePayload({
      chat,
      messages: silentChat,
      self: { id: "me", name: "Yashraj" },
      previews: true,
    }),
    null,
  );
  const payload = messagePayload({
    chat,
    messages: [message({ id: "a", mine: true }), message({ id: "b", text: "Incoming" })],
    self: { id: "me", name: "Yashraj" },
    previews: true,
  });
  assert.equal(payload.messages.length, 1);
  assert.equal(payload.messages[0].text, "Incoming");
});

test("previews off hides bodies, and sound off selects the silent channel", () => {
  const base = {
    chat,
    messages: [message({ text: "Bank code 1234" })],
    self: { id: "me", name: "Yashraj" },
  };
  const hidden = messagePayload({ ...base, previews: false });
  assert.equal(hidden.messages[0].text, "New message");
  assert.equal(hidden.silent, false);
  const muted = messagePayload({ ...base, previews: true, sound: false });
  assert.equal(muted.silent, true);
  assert.equal(muted.messages[0].text, "Bank code 1234");
});

test("direct conversations show the sender, groups use the chat name and a title", () => {
  const direct = messagePayload({
    chat,
    messages: [message({ text: "Hi" })],
    self: { id: "me", name: "Yashraj" },
    avatars: { 1: "file:///avatars/1.jpg" },
    previews: true,
  });
  assert.equal(direct.title, undefined);
  assert.equal(direct.isGroup, false);
  assert.equal(direct.messages[0].sender.name, "Eleanor Pena");
  assert.equal(direct.messages[0].sender.avatarUri, "file:///avatars/1.jpg");
  assert.equal(direct.self.id, "me");

  const selfAvatar = messagePayload({
    chat,
    messages: [message({ text: "Hi" })],
    self: { id: "me", name: "Yashraj", avatarUri: "file:///avatars/self.jpg" },
    previews: true,
  });
  assert.equal(selfAvatar.self.avatarUri, "file:///avatars/self.jpg");

  const group = messagePayload({
    chat: { ...chat, id: "g1", name: "The weekend people", group: true },
    messages: [message({ text: "Who brings the playlist?" })],
    self: { id: "me", name: "Yashraj" },
    previews: true,
  });
  assert.equal(group.title, "The weekend people");
  assert.equal(group.isGroup, true);
  assert.equal(group.messages[0].sender.name, "The weekend people");
});

test("recorded dates are preserved and missing ones stay strictly increasing", () => {
  const now = Date.parse("2026-01-01T12:00:00.000Z");
  const payload = messagePayload({
    chat,
    messages: [
      message({ id: "a", text: "old", createdAt: "2026-01-01T11:00:00.000Z" }),
      message({ id: "b", text: "undated" }),
      message({ id: "c", text: "newer" }),
    ],
    self: { id: "me", name: "Yashraj" },
    previews: true,
    now,
  });
  const times = payload.messages.map((entry) => entry.timestamp);
  assert.equal(times[0], Date.parse("2026-01-01T11:00:00.000Z"));
  assert.equal(times[1], now - 1000);
  assert.equal(times[2], now);
  assert.ok(times[1] > times[0] && times[2] > times[1]);
});

test("identical timestamps are pushed apart so MessagingStyle keeps its order", () => {
  const createdAt = "2026-01-01T12:00:00.000Z";
  const payload = messagePayload({
    chat,
    messages: [
      message({ id: "a", text: "one", createdAt }),
      message({ id: "b", text: "two", createdAt }),
      message({ id: "c", text: "three", createdAt }),
    ],
    self: { id: "me", name: "Yashraj" },
    previews: true,
  });
  const times = payload.messages.map((entry) => entry.timestamp);
  assert.deepEqual(times, [times[0], times[0] + 1, times[0] + 2]);
});

test("only the most recent messages are kept, oldest first", () => {
  const messages = Array.from({ length: NOTIFICATION_MESSAGE_LIMIT + 5 }, (_, index) =>
    message({ id: `m${index}`, text: `Message ${index}`, createdAt: new Date(1_700_000_000_000 + index * 60_000).toISOString() }),
  );
  const payload = messagePayload({
    chat,
    messages,
    self: { id: "me", name: "Yashraj" },
    previews: true,
  });
  assert.equal(payload.messages.length, NOTIFICATION_MESSAGE_LIMIT);
  assert.equal(payload.messages[0].text, "Message 5");
  assert.equal(payload.messages.at(-1).text, `Message ${messages.length - 1}`);
});
