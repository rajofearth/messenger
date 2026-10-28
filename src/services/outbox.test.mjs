/**
 * The cold-start read and the whole-queue write are the risky pair.
 *
 * `saveOutbox` replaces the stored queue: a row missing from the snapshot loses
 * its pending message row. So a snapshot may only be taken from a list the
 * storage layer actually returned — a send that starts during that read, or
 * after it failed, must not write a queue it never saw.
 *
 * The service is loaded here with a stubbed repository (the real SQLite
 * repository from testSupport backs it), and a fresh module per test, because
 * the queue state is module-level.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { pending, setup } from "../data/sqlite/testSupport.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const serviceFile = path.resolve(here, "outbox.ts");

// The queue service only reaches the filesystem for attachment copies and
// sweeping, which these tests never call.
const fileSystem = {
  Directory: class {},
  File: class {},
  Paths: { document: { uri: "file:///documents/" } },
};

function loadOutboxService(repository) {
  const compiled = ts.transpileModule(readFileSync(serviceFile, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  const require = (specifier) => {
    if (specifier === "expo-file-system") return fileSystem;
    if (specifier === "../data/messengerRepository") {
      return { messengerRepository: repository };
    }
    throw new Error(`unexpected import: ${specifier}`);
  };
  new Function("require", "exports", "module", compiled)(
    require,
    module.exports,
    module,
  );
  return module.exports;
}

/** Repository double over the real SQLite one, recording persisted snapshots. */
function trackedRepository(repo) {
  const saves = [];
  return {
    saves,
    loadOutbox: () => repo.loadOutbox(),
    saveOutbox: (records) => {
      saves.push(records.map((record) => record.message.id));
      return repo.saveOutbox(records);
    },
  };
}

const ids = (records) => records.map((record) => record.message.id);

/** Pending message rows for a chat, straight from the table. */
async function pendingRows(database, chatId) {
  const rows = await database.getAllAsync(
    "SELECT id FROM messages WHERE conversation_id = ? AND sequence IS NULL ORDER BY id",
    chatId,
  );
  return rows.map((row) => row.id);
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

test("a failed cold-start read cannot wipe rows queued before it", async () => {
  const { database, repository: repo } = await setup();
  await repo.saveOutbox([
    { chatId: "a", message: pending("p1") },
    { chatId: "b", message: pending("p2") },
  ]);

  let reads = 0;
  const service = loadOutboxService({
    loadOutbox: async () => {
      reads += 1;
      if (reads === 1) throw new Error("database is locked");
      return repo.loadOutbox();
    },
    saveOutbox: (records) => repo.saveOutbox(records),
  });

  assert.deepEqual(await service.loadOutbox(), []);
  assert.equal(service.outboxLoaded(), false);

  // A send in the cold-start window: in memory, but not persisted, because the
  // stored queue is unknown.
  await service.rememberOutgoing("a", pending("p3"));
  assert.deepEqual(service.outboxSnapshot().map((row) => row.message.id), [
    "p3",
  ]);
  assert.deepEqual(ids(await repo.loadOutbox()), ["p1", "p2"]);
  assert.deepEqual(
    (await database.getAllAsync("SELECT message_id FROM outbox")).map(
      (row) => row.message_id,
    ),
    ["p1", "p2"],
  );

  // The next read succeeds: the stored rows survive and the queued row joins
  // them, durably.
  assert.deepEqual(ids(await service.loadOutbox()).sort(), [
    "p1",
    "p2",
    "p3",
  ]);
  assert.equal(service.outboxLoaded(), true);
  assert.deepEqual(ids(await repo.loadOutbox()).sort(), ["p1", "p2", "p3"]);
  assert.deepEqual(await pendingRows(database, "a"), ["p1", "p3"]);
});

test("a send during the cold-start read does not write first", async () => {
  const { repository: repo } = await setup();
  await repo.saveOutbox([
    { chatId: "a", message: pending("p1") },
    { chatId: "b", message: pending("p2") },
  ]);

  const tracked = trackedRepository(repo);
  const gate = deferred();
  const service = loadOutboxService({
    ...tracked,
    loadOutbox: async () => {
      await gate.promise;
      return repo.loadOutbox();
    },
  });

  const loading = service.loadOutbox();
  await service.rememberOutgoing("a", pending("p3"));
  assert.deepEqual(tracked.saves, []);
  assert.deepEqual(ids(await repo.loadOutbox()), ["p1", "p2"]);

  gate.resolve();
  await loading;

  // One write, after the read, naming the merged queue.
  assert.deepEqual(tracked.saves, [["p1", "p2", "p3"]]);
  assert.deepEqual(ids(await repo.loadOutbox()).sort(), ["p1", "p2", "p3"]);
});

test("the happy path persists one snapshot per mutation, in order", async () => {
  const { database, repository: repo } = await setup();
  await repo.saveOutbox([{ chatId: "a", message: pending("p1") }]);

  const tracked = trackedRepository(repo);
  const service = loadOutboxService(tracked);

  assert.deepEqual(ids(await service.loadOutbox()), ["p1"]);
  assert.equal(service.outboxLoaded(), true);
  assert.deepEqual(tracked.saves, []);

  await service.rememberOutgoing("a", pending("p2"));
  assert.deepEqual(tracked.saves, [["p1", "p2"]]);

  await service.updateOutgoing("a", pending("p2", { text: "edited" }));
  assert.deepEqual(tracked.saves, [
    ["p1", "p2"],
    ["p1", "p2"],
  ]);

  await service.forgetOutgoing("p1");
  await service.forgetChat("a");
  assert.deepEqual(tracked.saves, [
    ["p1", "p2"],
    ["p1", "p2"],
    ["p2"],
    [],
  ]);
  assert.deepEqual(await repo.loadOutbox(), []);
  assert.deepEqual(await pendingRows(database, "a"), []);
});

test("sign-out closes writes again until the next successful read", async () => {
  const { repository: repo } = await setup();
  await repo.saveOutbox([{ chatId: "a", message: pending("p1") }]);

  const tracked = trackedRepository(repo);
  const service = loadOutboxService(tracked);
  await service.loadOutbox();

  await service.clearOutbox();
  assert.equal(service.outboxLoaded(), false);

  // A late send from the signed-out account must not write a queue into the
  // store that is about to be wiped. The stored row is left exactly as it was.
  await service.rememberOutgoing("a", pending("late"));
  assert.deepEqual(tracked.saves, []);
  assert.deepEqual(ids(await repo.loadOutbox()), ["p1"]);
});
