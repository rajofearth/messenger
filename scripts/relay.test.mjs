import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_QUEUED_BYTES,
  MAX_QUEUED_ENTRIES,
  PULL_DEFAULT,
  PULL_MAX,
  PURGE_BATCH,
  RELAY_TTL_MS,
  chunkForPurge,
  envelopeJson,
  mayEnqueue,
  parseEnvelope,
  queueBudget,
  relayExpiresAt,
} from "../convex/lib/relay.ts";

const baseEnvelope = {
  queueId: "q1",
  conversationId: "c1",
  op: "message",
  sequence: 7,
  senderId: "u1",
  createdAt: 1_700_000_000_000,
  message: {
    id: "m1",
    text: "hello",
    kind: "image",
    uri: "https://example.test/full.jpg",
    variants: [
      {
        name: "thumb",
        width: 320,
        height: 240,
        mimeType: "image/jpeg",
        uri: "https://example.test/thumb.jpg",
      },
    ],
    filename: "full.jpg",
    mimeType: "image/jpeg",
    width: 1280,
    height: 960,
    duration: 1.5,
    replyTo: { id: "m0", text: "earlier", mine: false },
  },
};

test("the caps match the relay contract", () => {
  assert.equal(MAX_QUEUED_ENTRIES, 200);
  assert.equal(MAX_QUEUED_BYTES, 10 * 1024 * 1024);
  assert.equal(MAX_ATTACHMENT_BYTES, 2 * 1024 * 1024);
  assert.equal(PULL_DEFAULT, 100);
  assert.equal(PULL_MAX, 200);
  assert.equal(PURGE_BATCH, 200);
  // A full queue must still drain in one round trip.
  assert.ok(MAX_QUEUED_ENTRIES >= PULL_MAX);
});

test("rows expire thirty days after they were created", () => {
  assert.equal(RELAY_TTL_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(relayExpiresAt(0), RELAY_TTL_MS);
  assert.equal(relayExpiresAt(1_700_000_000_000), 1_700_000_000_000 + RELAY_TTL_MS);
});

test("a full message envelope survives the round trip", () => {
  assert.deepEqual(parseEnvelope(envelopeJson(baseEnvelope)), baseEnvelope);
});

test("reaction and delete envelopes keep their target", () => {
  const reaction = {
    queueId: "q2",
    conversationId: "c1",
    op: "reaction",
    sequence: 0,
    senderId: "u1",
    createdAt: 5,
    targetMessageId: "m1",
    reactionKey: "like",
  };
  assert.deepEqual(parseEnvelope(envelopeJson(reaction)), reaction);

  const removal = {
    queueId: "q3",
    conversationId: "c1",
    op: "delete",
    sequence: 0,
    senderId: "u1",
    createdAt: 6,
    targetMessageId: "m1",
  };
  assert.deepEqual(parseEnvelope(envelopeJson(removal)), removal);
});

test("malformed envelopes are rejected instead of thrown", () => {
  const broken = [
    "",
    "not json",
    "null",
    "[]",
    "42",
    JSON.stringify({}),
    JSON.stringify({ ...baseEnvelope, queueId: "" }),
    JSON.stringify({ ...baseEnvelope, conversationId: 4 }),
    JSON.stringify({ ...baseEnvelope, senderId: null }),
    JSON.stringify({ ...baseEnvelope, op: "typing" }),
    JSON.stringify({ ...baseEnvelope, sequence: "7" }),
    JSON.stringify({ ...baseEnvelope, sequence: Number.NaN }),
    JSON.stringify({ ...baseEnvelope, createdAt: null }),
    // A message op must carry its payload.
    JSON.stringify({ ...baseEnvelope, message: undefined }),
    JSON.stringify({ ...baseEnvelope, message: {} }),
    JSON.stringify({ ...baseEnvelope, message: { id: "m1", kind: "sticker" } }),
    JSON.stringify({ ...baseEnvelope, message: { id: "m1", width: "wide" } }),
    JSON.stringify({ ...baseEnvelope, message: { id: "m1", variants: {} } }),
    JSON.stringify({
      ...baseEnvelope,
      message: {
        id: "m1",
        variants: [{ name: "thumb", width: 1, height: 1, mimeType: "image/jpeg" }],
      },
    }),
    JSON.stringify({
      ...baseEnvelope,
      message: { id: "m1", replyTo: { id: "m0", text: "earlier" } },
    }),
    // An op without a target cannot be applied.
    JSON.stringify({ ...baseEnvelope, op: "delete", message: undefined }),
    JSON.stringify({
      ...baseEnvelope,
      op: "reaction",
      message: undefined,
      targetMessageId: "m1",
      reactionKey: 3,
    }),
  ];
  for (const value of broken) {
    assert.equal(parseEnvelope(value), null, value);
  }
});

test("the queue budget sums bytes and counts rows", () => {
  assert.deepEqual(queueBudget([]), { count: 0, bytes: 0 });
  assert.deepEqual(queueBudget([{ bytes: 3 }, { bytes: 4 }]), {
    count: 2,
    bytes: 7,
  });
});

test("exactly the entry cap fits and one more is refused", () => {
  const atCap = Array.from({ length: MAX_QUEUED_ENTRIES }, () => ({ bytes: 0 }));
  assert.equal(mayEnqueue(queueBudget(atCap.slice(0, -1)), { bytes: 0 }), true);
  assert.equal(mayEnqueue(queueBudget(atCap), { bytes: 0 }), false);
});

test("exactly the byte cap fits and one more byte is refused", () => {
  const chunk = 64 * 1024;
  const atCap = Array.from(
    { length: MAX_QUEUED_BYTES / chunk },
    () => ({ bytes: chunk }),
  );
  const budget = queueBudget(atCap);
  assert.equal(budget.bytes, MAX_QUEUED_BYTES);
  assert.equal(mayEnqueue(budget, { bytes: 0 }), true);
  assert.equal(mayEnqueue(budget, { bytes: 1 }), false);
  // A single attachment is capped well below the queue budget.
  assert.ok(MAX_ATTACHMENT_BYTES < MAX_QUEUED_BYTES);
});

test("a purge sweep is split into bounded batches", () => {
  assert.deepEqual(chunkForPurge([]), []);
  assert.deepEqual(chunkForPurge(["a"]), [["a"]]);
  const ids = Array.from({ length: PURGE_BATCH * 2 + 1 }, (_, index) => `q${index}`);
  const chunks = chunkForPurge(ids);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, PURGE_BATCH);
  assert.deepEqual(chunks[1], ids.slice(PURGE_BATCH, PURGE_BATCH * 2));
  assert.deepEqual(chunks[2], ids.slice(PURGE_BATCH * 2));
  assert.deepEqual(chunks.flat(), ids);
});
