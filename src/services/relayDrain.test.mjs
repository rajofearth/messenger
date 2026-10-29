/**
 * The drain's only safety property is order: commit before ack.
 *
 * These tests use fake dependencies, so the module is compiled with a stub
 * loader that fails on any real Convex, SQLite or Expo import. What is checked
 * is the sequence of writes and the queue ids that survive each failure.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const modules = new Map();

// App-only dependencies. The drain logic must never execute them in a test.
const stubs = {
  "../../convex/_generated/api": { api: { relay: {} } },
  "./convexClient": { convexClient: {} },
  "../data/messengerRepository": { messengerRepository: {} },
  "./mediaCache": { cacheRemoteMedia: async () => undefined },
};

function load(relative) {
  const file = path.resolve(here, relative);
  const cached = modules.get(file);
  if (cached) return cached.exports;
  const module = { exports: {} };
  modules.set(file, module);
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const require = (specifier) => {
    if (Object.hasOwn(stubs, specifier)) return stubs[specifier];
    if (!specifier.startsWith(".")) {
      throw new Error(`Missing module mock: ${specifier} (from ${file})`);
    }
    const target = path.resolve(path.dirname(file), specifier);
    return load(
      path.relative(here, target.endsWith(".ts") ? target : `${target}.ts`),
    );
  };
  new Function("require", "exports", "module", compiled)(
    require,
    module.exports,
    module,
  );
  return module.exports;
}

const { runRelayDrain } = load("relayDrain.ts");

const CREATED_AT = Date.UTC(2026, 9, 29, 10, 0);

function envelope(id, conversationId, patch = {}) {
  return {
    queueId: `q-${id}`,
    conversationId,
    op: "message",
    sequence: 1,
    senderId: "them",
    createdAt: CREATED_AT,
    message: { id, text: `text ${id}` },
    ...patch,
  };
}

function harness(options = {}) {
  const calls = [];
  const acks = [];
  const saves = [];
  const pendingRows = new Set(options.pending?.map((row) => row.queueId) ?? []);
  const deps = {
    pull: async () => {
      calls.push("pull");
      if (options.pullError) throw new Error("offline");
      return options.page ?? { entries: [], more: false };
    },
    ack: async (queueIds) => {
      calls.push(`ack:${queueIds.join(",")}`);
      if (options.ackError) throw new Error("offline");
      acks.push([...queueIds]);
    },
    save: async (chatId, messages, queueIds) => {
      calls.push(`save:${chatId}:${messages.map((item) => item.id).join(",")}`);
      if (options.saveError) throw new Error("disk");
      saves.push({ chatId, messages, queueIds });
      for (const id of queueIds) pendingRows.add(id);
    },
    clearPending: async (ids) => {
      calls.push(`clear:${ids.join(",")}`);
      for (const id of ids) pendingRows.delete(id);
    },
  };
  if (options.pending) {
    deps.pending = async () => {
      calls.push("pending");
      return options.pending;
    };
  }
  if (options.media) deps.materializeMedia = options.media;
  if (options.applyReaction) deps.applyReaction = options.applyReaction;
  if (options.applyDelete) deps.applyDelete = options.applyDelete;
  return { acks, calls, deps, pendingRows, saves };
}

test("leftover pending acks are flushed before the pull", async () => {
  const pending = [{ queueId: "q-old", conversationId: "c1" }];
  const { calls, deps, pendingRows } = harness({ pending });

  const touched = await runRelayDrain(deps, "me");

  assert.deepEqual(touched, []);
  assert.deepEqual(calls, ["pending", "ack:q-old", "clear:q-old", "pull"]);
  assert.equal(pendingRows.has("q-old"), false);
});

test("a message is saved and only then acknowledged", async () => {
  const entry = envelope("m1", "c1");
  const { acks, calls, deps, saves } = harness({
    page: { entries: [entry], more: false },
  });

  const touched = await runRelayDrain(deps, "me");

  assert.deepEqual(touched, ["c1"]);
  assert.deepEqual(calls, ["pull", "save:c1:m1", "ack:q-m1", "clear:q-m1"]);
  assert.deepEqual(acks, [["q-m1"]]);
  const [stored] = saves[0].messages;
  assert.equal(stored.id, "m1");
  assert.equal(stored.sequence, 1);
  assert.equal(stored.mine, false);
  assert.equal(stored.createdAt, new Date(CREATED_AT).toISOString());
  assert.equal(stored.time.length > 0, true);
});

test("a failed save is never acknowledged", async () => {
  const { calls, deps, pendingRows } = harness({
    page: { entries: [envelope("m1", "c1")], more: false },
    saveError: true,
  });

  const touched = await runRelayDrain(deps, "me");

  assert.deepEqual(touched, []);
  assert.deepEqual(calls, ["pull", "save:c1:m1"]);
  assert.equal(pendingRows.size, 0);
});

test("a failed media download skips that entry and leaves it unacked", async () => {
  const attachment = envelope("m1", "c1", {
    message: { id: "m1", kind: "image", uri: "https://cdn.example/m1.jpg" },
  });
  const text = envelope("m2", "c1");
  const { acks, deps, saves } = harness({
    page: { entries: [attachment, text], more: false },
    media: async (entry) => (entry.queueId === "q-m1" ? undefined : "file:///m2"),
  });

  const touched = await runRelayDrain(deps, "me");

  assert.deepEqual(touched, ["c1"]);
  assert.deepEqual(
    saves[0].messages.map((item) => item.id),
    ["m2"],
  );
  assert.deepEqual(acks, [["q-m2"]]);
});

test("a failed ack keeps the pending row for the next drain", async () => {
  const { calls, deps, pendingRows } = harness({
    page: { entries: [envelope("m1", "c1")], more: false },
    ackError: true,
  });

  const touched = await runRelayDrain(deps, "me");

  assert.deepEqual(touched, ["c1"]);
  assert.equal(pendingRows.has("q-m1"), true);
  assert.equal(
    calls.some((call) => call.startsWith("clear:")),
    false,
  );
});

test("reaction and delete envelopes are applied and then acked", async () => {
  const reactions = [];
  const deletes = [];
  const reaction = envelope("r1", "c1", {
    op: "reaction",
    targetMessageId: "m1",
    reactionKey: "fire",
  });
  const deletion = envelope("d1", "c1", {
    op: "delete",
    targetMessageId: "m1",
  });
  const { acks, calls, deps } = harness({
    page: { entries: [reaction, deletion], more: false },
    applyReaction: async (...args) => reactions.push(args),
    applyDelete: async (...args) => deletes.push(args),
  });

  const touched = await runRelayDrain(deps, "me");

  assert.deepEqual(touched, ["c1"]);
  assert.deepEqual(reactions, [["c1", "m1", "fire"]]);
  assert.deepEqual(deletes, [["c1", "m1"]]);
  assert.deepEqual(acks, [["q-r1", "q-d1"]]);
  assert.equal(
    calls.some((call) => call.startsWith("save:")),
    false,
  );
});

test("the result names each touched conversation once", async () => {
  const entries = [
    envelope("m1", "c1"),
    envelope("m2", "c2"),
    envelope("m3", "c1"),
  ];
  const { acks, deps, saves } = harness({
    page: { entries, more: false },
  });

  const touched = await runRelayDrain(deps, "me");

  assert.deepEqual(touched, ["c1", "c2"]);
  assert.deepEqual(
    saves.map((save) => [save.chatId, save.messages.map((item) => item.id)]),
    [
      ["c1", ["m1", "m3"]],
      ["c2", ["m2"]],
    ],
  );
  assert.deepEqual(acks, [["q-m1", "q-m3", "q-m2"]]);
});

test("a pull failure returns quietly with nothing touched", async () => {
  const { acks, deps } = harness({ pullError: true });

  assert.deepEqual(await runRelayDrain(deps, "me"), []);
  assert.deepEqual(acks, []);
});
