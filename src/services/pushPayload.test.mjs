import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function loadModule(relative) {
  const compiled = ts.transpileModule(
    readFileSync(new URL(relative, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    assert.fail(`Unexpected require: ${name}`);
  }, exports);
  return exports;
}

const { parseWake, WAKE_QUEUE_ID_MAX } = loadModule("./pushPayload.ts");

/** The FCM data map as delivered to a plain data message. */
function fcm(extra = {}) {
  return { data: { v: "1", type: "wake", queueId: "q-1", ...extra } };
}

/** The serialized `RemoteMessage` the expo-notifications task receives. */
function remoteMessage(extra = {}) {
  return {
    collapseKey: "",
    data: { dataString: "{}", v: "1", type: "wake", queueId: "q-1", ...extra },
    from: "1234567890",
    messageId: "0:1%abc",
    notification: null,
    priority: 0,
    sentTime: 1,
    to: "1234567890",
    ttl: 0,
  };
}

test("the FCM data shape is accepted", () => {
  assert.deepEqual(parseWake(fcm()), {
    v: "1",
    type: "wake",
    queueId: "q-1",
  });
});

test("the serialized RemoteMessage shape is accepted", () => {
  assert.deepEqual(parseWake(remoteMessage()), {
    v: "1",
    type: "wake",
    queueId: "q-1",
  });
});

test("a wake queue id is an opaque string, not a number", () => {
  assert.equal(parseWake(fcm({ queueId: 42 })), null);
  assert.equal(parseWake(remoteMessage({ queueId: 42 })), null);
});

test("a wrong protocol version is rejected", () => {
  assert.equal(parseWake(fcm({ v: "2" })), null);
  assert.equal(parseWake(fcm({ v: 1 })), null);
  assert.equal(parseWake(remoteMessage({ v: "0" })), null);
});

test("a wrong message type is rejected", () => {
  assert.equal(parseWake(fcm({ type: "chat" })), null);
  assert.equal(parseWake(remoteMessage({ type: "call" })), null);
});

test("the queue id must be present, non-empty and at most the limit", () => {
  assert.equal(parseWake(fcm({ queueId: undefined })), null);
  assert.equal(parseWake(fcm({ queueId: "" })), null);
  assert.equal(parseWake(fcm({ queueId: "x".repeat(WAKE_QUEUE_ID_MAX + 1) })), null);
  assert.equal(
    parseWake(fcm({ queueId: "x".repeat(WAKE_QUEUE_ID_MAX) }))?.queueId,
    "x".repeat(WAKE_QUEUE_ID_MAX),
  );
});

test("anything that is not an object with a data object is rejected", () => {
  for (const payload of [null, undefined, 7, "wake", true, [], [fcm()]]) {
    assert.equal(parseWake(payload), null);
  }
  assert.equal(parseWake({}), null);
  assert.equal(parseWake({ data: null }), null);
  assert.equal(parseWake({ data: "wake" }), null);
  assert.equal(parseWake({ notification: { title: "hi" } }), null);
});

test("extra keys are ignored instead of copied into the wake", () => {
  const wake = parseWake(
    remoteMessage({ extra: { nested: true }, sentTime: 99, from: "spoofed" }),
  );
  assert.deepEqual(wake, { v: "1", type: "wake", queueId: "q-1" });
});

test("parsing never throws on hostile input", () => {
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error("boom");
      },
    },
  );
  assert.equal(parseWake({ data: hostile }), null);
});
