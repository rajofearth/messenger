import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Node strips the types but cannot resolve this module's extensionless runtime
// import, so compile the pair the way src/services/mediaCache.test.mjs does.
function load(relative, modules = {}) {
  const compiled = ts.transpileModule(
    readFileSync(new URL(relative, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    assert.ok(name in modules, `Missing mock: ${name}`);
    return modules[name];
  }, exports);
  return exports;
}

const actions = load("./messageActions.ts");
const { applyOutboxToChats, hydrateOutbox, isSendConfirmed, retryableOutbox } =
  load("./outbox.ts", { "./messageActions": actions });

const at = (minute) =>
  new Date(Date.UTC(2026, 9, 25, 10, minute)).toISOString();

function message(overrides = {}) {
  return {
    id: "local-1",
    text: "Hello",
    mine: true,
    time: "10:00",
    createdAt: at(0),
    status: "sending",
    ...overrides,
  };
}

function record(chatId, item) {
  return { chatId, message: item };
}

function chat(overrides = {}) {
  return {
    id: "chat-1",
    name: "Alex",
    avatar: "",
    preview: "Old preview",
    time: "09:00",
    unread: 0,
    color: "#fff",
    ...overrides,
  };
}

test("hydration marks outbox rows failed and dedupes by message id", () => {
  const confirmed = {
    id: "server-1",
    text: "Earlier",
    mine: true,
    time: "09:00",
    sequence: 1,
    createdAt: at(-5),
  };
  const first = message({ id: "local-1", status: "sending" });
  const duplicate = message({ id: "local-1", status: "sent" });
  const second = message({ id: "local-2", text: "Second" });
  const hydrated = hydrateOutbox({ "chat-1": [confirmed] }, [
    record("chat-1", first),
    record("chat-1", duplicate),
    record("chat-1", second),
  ]);
  assert.deepEqual(
    hydrated["chat-1"].map((item) => item.id),
    ["server-1", "local-1", "local-2"],
  );
  assert.equal(hydrated["chat-1"][0].sequence, 1);
  assert.equal(hydrated["chat-1"][1].status, "failed");
  assert.equal(hydrated["chat-1"][2].status, "failed");
});

test("hydration appends records per chat in the order they were sent", () => {
  const hydrated = hydrateOutbox({}, [
    record("chat-1", message({ id: "a", createdAt: at(1) })),
    record("chat-2", message({ id: "b", createdAt: at(2) })),
    record("chat-1", message({ id: "c", createdAt: at(3) })),
  ]);
  assert.deepEqual(
    hydrated["chat-1"].map((item) => item.id),
    ["a", "c"],
  );
  assert.deepEqual(
    hydrated["chat-2"].map((item) => item.id),
    ["b"],
  );
});

test("hydration leaves the map untouched when there is nothing queued", () => {
  const current = { "chat-1": [message()] };
  assert.equal(hydrateOutbox(current, []), current);
});

test("the newest outbox record supplies the chat preview and pending status", () => {
  const older = message({
    id: "local-1",
    text: "First try",
    time: "10:00",
    createdAt: at(0),
  });
  const newer = message({
    id: "local-2",
    kind: "image",
    text: undefined,
    time: "10:05",
    createdAt: at(5),
    status: "failed",
  });
  const [updated] = applyOutboxToChats(
    [chat(), chat({ id: "chat-2", preview: "Untouched" })],
    [record("chat-1", older), record("chat-1", newer)],
  );
  assert.equal(updated.preview, "You: Sent a photo");
  assert.equal(updated.time, "10:05");
  assert.equal(updated.lastMessageAt, Date.parse(at(5)));
  assert.equal(updated.lastMessageStatus, "failed");
});

test("an older outbox row never hides a newer known message", () => {
  const current = chat({
    preview: "Newer reply",
    lastMessageAt: Date.parse(at(9)),
  });
  const [updated] = applyOutboxToChats(
    [current],
    [record("chat-1", message({ createdAt: at(1) }))],
  );
  assert.equal(updated, current);
});

test("chats without a queued row are returned unchanged", () => {
  const first = chat();
  const second = chat({ id: "chat-2" });
  const next = applyOutboxToChats(
    [first, second],
    [record("chat-1", message())],
  );
  assert.equal(next[1], second);
  assert.notEqual(next[0], first);
});

test("retryable keeps failed and sending rows only", () => {
  const records = [
    record("chat-1", message({ id: "failed", status: "failed" })),
    record("chat-1", message({ id: "sending", status: "sending" })),
    record("chat-1", message({ id: "sent", status: "sent" })),
    record("chat-1", message({ id: "confirmed", status: undefined })),
  ];
  assert.deepEqual(
    retryableOutbox(records).map((item) => item.message.id),
    ["failed", "sending"],
  );
  assert.deepEqual(retryableOutbox([]), []);
});

test("a send is confirmed only by a server sequence", () => {
  assert.equal(isSendConfirmed({ id: "server-1", sequence: 7 }), true);
  // The mutation resolved but the server has not assigned a sequence yet.
  assert.equal(isSendConfirmed({ id: "server-1" }), false);
  assert.equal(isSendConfirmed({ id: "server-1", sequence: 0 }), false);
  assert.equal(isSendConfirmed({ sequence: 3 }), false);
  assert.equal(isSendConfirmed(null), false);
  assert.equal(isSendConfirmed(undefined), false);
});
