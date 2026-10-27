import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  oldestConfirmedSequence,
  readOlderServerPages,
} from "../src/state/threadPaging.ts";

function row(sequence, extra = {}) {
  return {
    id: `m${sequence}`,
    mine: false,
    time: "12:00",
    sequence,
    ...extra,
  };
}

test("the oldest confirmed sequence ignores optimistic rows", () => {
  assert.equal(
    oldestConfirmedSequence([
      { id: "pending", mine: true, time: "12:03", status: "sending" },
      row(41),
      row(39),
    ]),
    39,
  );
  assert.equal(oldestConfirmedSequence([]), undefined);
  assert.equal(
    oldestConfirmedSequence([
      { id: "pending", mine: true, time: "12:03", status: "failed" },
    ]),
    undefined,
  );
});

test("a short visible page ends the walk but is still returned", async () => {
  const seen = [];
  const result = await readOlderServerPages({
    beforeSequence: 41,
    limit: 100,
    fetchPage: async (before, limit) => {
      seen.push([before, limit]);
      return { rows: [row(40), row(39)], hasMore: false };
    },
  });
  assert.deepEqual(
    result.rows.map((message) => message.sequence),
    [40, 39],
  );
  assert.equal(result.hasMore, false);
  assert.deepEqual(seen, [[41, 100]]);
});

test("a fully hidden page is skipped with the server's raw cursor", async () => {
  const seen = [];
  const result = await readOlderServerPages({
    beforeSequence: 50,
    limit: 100,
    fetchPage: async (before) => {
      seen.push(before);
      if (before === 50) {
        return { rows: [], hasMore: true, nextBeforeSequence: 20 };
      }
      return { rows: [row(19), row(18)], hasMore: true };
    },
  });
  assert.deepEqual(seen, [50, 20]);
  assert.deepEqual(
    result.rows.map((message) => message.sequence),
    [19, 18],
  );
  assert.equal(result.hasMore, true);
});

test("the walk stops when the server reports the end", async () => {
  const result = await readOlderServerPages({
    beforeSequence: 5,
    limit: 100,
    fetchPage: async () => ({ rows: [], hasMore: false }),
  });
  assert.deepEqual(result, { rows: [], hasMore: false });
});

test("a repeated or non-advancing cursor cannot loop", async () => {
  for (const nextBeforeSequence of [9, 12]) {
    let calls = 0;
    const result = await readOlderServerPages({
      beforeSequence: 9,
      limit: 100,
      fetchPage: async () => {
        calls += 1;
        return { rows: [], hasMore: true, nextBeforeSequence };
      },
    });
    assert.equal(calls, 1);
    assert.deepEqual(result, { rows: [], hasMore: false });
  }
  let missing = 0;
  const result = await readOlderServerPages({
    beforeSequence: 9,
    limit: 100,
    fetchPage: async () => {
      missing += 1;
      return { rows: [], hasMore: true };
    },
  });
  assert.equal(missing, 1);
  assert.equal(result.hasMore, false);
});

test("a long run of hidden pages is bounded", async () => {
  let calls = 0;
  const result = await readOlderServerPages({
    beforeSequence: 500,
    limit: 100,
    maxHiddenPages: 3,
    fetchPage: async (before) => {
      calls += 1;
      return {
        rows: [],
        hasMore: true,
        nextBeforeSequence: before - 100,
      };
    },
  });
  assert.equal(calls, 3);
  assert.deepEqual(result, { rows: [], hasMore: false });
});


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

const threadPaging = loadModule("../src/state/threadPaging.ts");
const threadMerge = loadModule("../src/domain/threadMerge.ts");
const { loadOlderThread } = loadModule("../src/state/loadOlderThread.ts", {
  "./threadPaging": threadPaging,
  "../domain/threadMerge": threadMerge,
});

test("an optimistic-only thread has no older history", async () => {
  let calls = 0;
  const result = await loadOlderThread({
    messages: [{ id: "pending", mine: true, time: "12:00", status: "sending" }],
    readLocal: async () => { calls += 1; return []; },
    readRemote: async () => { calls += 1; return { rows: [], hasMore: false }; },
    canReadRemote: async () => true,
    save: async () => { calls += 1; },
    markExhausted: async () => { calls += 1; },
  });
  assert.deepEqual(result, { rows: [], hasMore: false });
  assert.equal(calls, 0);
});

test("a full local page is served without the network", async () => {
  const local = Array.from({ length: 100 }, (_, index) => row(400 + index));
  let remote = 0;
  const result = await loadOlderThread({
    messages: [row(500)],
    readLocal: async (before, limit) => {
      assert.equal(before, 500);
      assert.equal(limit, 100);
      return local;
    },
    readRemote: async () => { remote += 1; return { rows: [], hasMore: false }; },
    canReadRemote: async () => true,
    save: async () => {},
    markExhausted: async () => {},
  });
  assert.equal(remote, 0);
  assert.equal(result.rows.length, 100);
  assert.equal(result.hasMore, true);
});

test("a full local page that reaches sequence 1 ends the thread", async () => {
  const local = Array.from({ length: 100 }, (_, index) => row(index + 1));
  const result = await loadOlderThread({
    messages: [row(101)],
    readLocal: async () => local,
    readRemote: async () => { throw new Error("server not needed"); },
    canReadRemote: async () => true,
    save: async () => {},
    markExhausted: async () => {},
  });
  assert.equal(result.rows.length, 100);
  assert.equal(result.hasMore, false);
});

test("a short local page asks the server for the rows this device never saw", async () => {
  const saved = [];
  let exhausted = 0;
  const result = await loadOlderThread({
    messages: [row(500)],
    readLocal: async () => [row(400)],
    readRemote: async (before, limit) => {
      assert.equal(before, 500);
      assert.equal(limit, 100);
      return { rows: [row(399), row(398)], hasMore: true };
    },
    canReadRemote: async () => true,
    save: async (rows) => { saved.push(...rows.map((item) => item.sequence)); },
    markExhausted: async () => { exhausted += 1; },
  });
  assert.deepEqual(saved, [399, 398]);
  assert.deepEqual(result.rows.map((item) => item.sequence), [398, 399, 400]);
  assert.equal(result.hasMore, true);
  assert.equal(exhausted, 0);
});

test("only the server can prove the history ended", async () => {
  let exhausted = 0;
  const result = await loadOlderThread({
    messages: [row(9)],
    readLocal: async () => [],
    readRemote: async () => ({ rows: [row(1)], hasMore: false }),
    canReadRemote: async () => true,
    save: async () => {},
    markExhausted: async () => { exhausted += 1; },
  });
  assert.deepEqual(result.rows.map((item) => item.sequence), [1]);
  assert.equal(result.hasMore, false);
  assert.equal(exhausted, 1);
});

test("an exhausted thread does not call the server again", async () => {
  let remote = 0;
  const result = await loadOlderThread({
    messages: [row(9)],
    readLocal: async () => [],
    readRemote: async () => { remote += 1; return { rows: [], hasMore: false }; },
    canReadRemote: async () => false,
    save: async () => {},
    markExhausted: async () => { throw new Error("already exhausted"); },
  });
  assert.deepEqual(result, { rows: [], hasMore: false });
  assert.equal(remote, 0);
});

test("a row already on disk is not duplicated by the server page", async () => {
  const result = await loadOlderThread({
    messages: [row(40)],
    readLocal: async () => [row(39), row(38)],
    readRemote: async () => ({ rows: [row(39), row(37)], hasMore: false }),
    canReadRemote: async () => true,
    save: async () => {},
    markExhausted: async () => {},
  });
  assert.deepEqual(result.rows.map((item) => item.sequence), [37, 38, 39]);
});

test("the fetched row wins while retained local rows stay in the page", async () => {
  const result = await loadOlderThread({
    messages: [row(40)],
    readLocal: async () => [
      row(39, { text: "stale local text" }),
      row(38, { text: "local-only history" }),
    ],
    readRemote: async () => ({
      rows: [row(39, { text: "fresh server text" }), row(37)],
      hasMore: false,
    }),
    canReadRemote: async () => true,
    save: async () => {},
    markExhausted: async () => {},
  });

  assert.deepEqual(result.rows.map((item) => item.sequence), [37, 38, 39]);
  assert.equal(result.rows.find((item) => item.sequence === 39)?.text, "fresh server text");
  assert.equal(result.rows.find((item) => item.sequence === 38)?.text, "local-only history");
});
