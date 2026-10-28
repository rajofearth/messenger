import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  OLDER_HIDDEN_PAGE_BUDGET,
  readOlderServerPages,
} from "./threadPaging.ts";

function row(sequence, extra = {}) {
  return {
    id: `m${sequence}`,
    mine: false,
    time: "12:00",
    sequence,
    ...extra,
  };
}

function loadModule(relative, modules = {}) {
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

const threadPaging = loadModule("./threadPaging.ts");
const threadMerge = loadModule("../domain/threadMerge.ts");
const { loadOlderThread } = loadModule("./loadOlderThread.ts", {
  "./threadPaging": threadPaging,
  "../domain/threadMerge": threadMerge,
});

test("the hidden-page budget reports a stop the server did not confirm", async () => {
  assert.equal(OLDER_HIDDEN_PAGE_BUDGET, 4);
  let calls = 0;
  const result = await readOlderServerPages({
    beforeSequence: 900,
    limit: 100,
    fetchPage: async (before) => {
      calls += 1;
      return { rows: [], hasMore: true, nextBeforeSequence: before - 100 };
    },
  });
  assert.equal(calls, OLDER_HIDDEN_PAGE_BUDGET);
  assert.deepEqual(result, {
    rows: [],
    hasMore: true,
    exhaustedByBudget: true,
  });
});

test("a budget stop keeps the control and never marks the thread exhausted", async () => {
  const cursors = [];
  let exhausted = 0;
  const result = await loadOlderThread({
    messages: [row(900)],
    readLocal: async () => [],
    readRemote: async (before) => {
      cursors.push(before);
      return { rows: [], hasMore: true, nextBeforeSequence: before - 100 };
    },
    canReadRemote: async () => true,
    save: async () => {
      assert.fail("a hidden range has nothing to save");
    },
    markExhausted: async () => {
      exhausted += 1;
    },
  });
  assert.equal(cursors.length, OLDER_HIDDEN_PAGE_BUDGET);
  assert.equal(exhausted, 0);
  assert.deepEqual(result, { rows: [], hasMore: true });
});

test("a failed request keeps the local rows instead of ending the thread", async () => {
  const local = [row(99), row(100)];
  let saved = 0;
  let exhausted = 0;
  const result = await loadOlderThread({
    messages: [row(101)],
    readLocal: async () => local,
    readRemote: async () => {
      throw new Error("offline");
    },
    canReadRemote: async () => true,
    save: async () => {
      saved += 1;
    },
    markExhausted: async () => {
      exhausted += 1;
    },
  });
  assert.deepEqual(
    result.rows.map((message) => message.sequence),
    [99, 100],
  );
  assert.equal(result.hasMore, true);
  assert.equal(result.failed, true);
  assert.equal(saved, 0);
  assert.equal(exhausted, 0);
});

test("the merged page is saved so a cached file URI survives", async () => {
  const savedRows = [];
  const result = await loadOlderThread({
    messages: [row(40)],
    readLocal: async () => [row(39, { uri: "file:///cached/39.jpg" })],
    readRemote: async () => ({ rows: [row(39), row(38)], hasMore: false }),
    canReadRemote: async () => true,
    save: async (rows) => {
      savedRows.push(...rows);
    },
    markExhausted: async () => {},
  });
  assert.deepEqual(
    savedRows.map((message) => message.sequence),
    [38, 39],
  );
  assert.equal(
    savedRows.find((message) => message.sequence === 39)?.uri,
    "file:///cached/39.jpg",
  );
  assert.deepEqual(
    result.rows.map((message) => message.sequence),
    [38, 39],
  );
  assert.equal(result.failed, undefined);
});

test("a successful page saves before it is returned and can end the thread", async () => {
  const order = [];
  let exhausted = 0;
  const result = await loadOlderThread({
    messages: [row(3)],
    readLocal: async () => [],
    readRemote: async () => ({ rows: [row(2), row(1)], hasMore: false }),
    canReadRemote: async () => true,
    save: async (rows) => {
      order.push(`save:${rows.length}`);
    },
    markExhausted: async () => {
      order.push("exhaust");
      exhausted += 1;
    },
  });
  assert.deepEqual(order, ["save:2", "exhaust"]);
  assert.equal(exhausted, 1);
  assert.equal(result.hasMore, false);
  assert.deepEqual(
    result.rows.map((message) => message.sequence),
    [1, 2],
  );
});
