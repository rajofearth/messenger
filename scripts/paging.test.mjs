import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  CHAT_COMPONENT_PAGE_MAX,
  MESSAGE_PAGE_DEFAULT,
  MESSAGE_PAGE_MAX,
  messagePageMeta,
  messagePageSize,
} from "../convex/lib/paging.ts";

const root = fileURLToPath(new URL("../", import.meta.url));

test("a requested limit becomes a whole page size from 1 to 200", () => {
  assert.equal(MESSAGE_PAGE_DEFAULT, 100);
  assert.equal(MESSAGE_PAGE_MAX, 200);
  assert.equal(CHAT_COMPONENT_PAGE_MAX, 100);
  const cases = [
    [undefined, 100],
    [Number.NaN, 100],
    [Number.POSITIVE_INFINITY, 100],
    [0, 1],
    [-5, 1],
    [1, 1],
    [12.9, 12],
    [100, 100],
    [200, 200],
    [201, 200],
    [1_000_000, 200],
  ];
  for (const [input, expected] of cases) {
    assert.equal(messagePageSize(input), expected, `limit ${input}`);
  }
});

test("a full raw page reports more history with the oldest raw sequence", () => {
  assert.deepEqual(
    messagePageMeta({ rawCount: 100, limit: 100, oldestSequence: 41 }),
    { hasMore: true, nextBeforeSequence: 41 },
  );
  assert.deepEqual(
    messagePageMeta({
      rawCount: 3,
      limit: 3,
      oldestSequence: 40,
      beforeSequence: 60,
    }),
    { hasMore: true, nextBeforeSequence: 40 },
  );
});

test("a short, empty, or cursor-less page reports the end of history", () => {
  assert.deepEqual(
    messagePageMeta({ rawCount: 99, limit: 100, oldestSequence: 41 }),
    { hasMore: false, nextBeforeSequence: undefined },
  );
  assert.deepEqual(
    messagePageMeta({ rawCount: 0, limit: 100 }),
    { hasMore: false, nextBeforeSequence: undefined },
  );
  assert.deepEqual(
    messagePageMeta({ rawCount: 100, limit: 100 }),
    { hasMore: false, nextBeforeSequence: undefined },
  );
  assert.deepEqual(
    messagePageMeta({ rawCount: 2, limit: 0, oldestSequence: 41 }),
    { hasMore: false, nextBeforeSequence: undefined },
  );
});

test("paging never goes below sequence 1 or repeats the current cursor", () => {
  assert.deepEqual(
    messagePageMeta({ rawCount: 100, limit: 100, oldestSequence: 1 }),
    { hasMore: false, nextBeforeSequence: undefined },
  );
  assert.deepEqual(
    messagePageMeta({
      rawCount: 100,
      limit: 100,
      oldestSequence: 0,
    }),
    { hasMore: false, nextBeforeSequence: undefined },
  );
  assert.deepEqual(
    messagePageMeta({
      rawCount: 100,
      limit: 100,
      oldestSequence: 41,
      beforeSequence: 41,
    }),
    { hasMore: false, nextBeforeSequence: undefined },
  );
});

test("a raw page hidden entirely by deletes or a clear still advances", () => {
  // The helper has no filtered count to consult; it only sees the raw page.
  const rawPage = Array.from({ length: 100 }, (_, index) => ({
    sequence: index + 51,
  }));
  const visible = rawPage.filter(() => false);
  assert.equal(visible.length, 0);
  assert.deepEqual(
    messagePageMeta({
      rawCount: rawPage.length,
      limit: 100,
      oldestSequence: rawPage[0].sequence,
    }),
    { hasMore: true, nextBeforeSequence: 51 },
  );
});

test("walking backwards reaches sequence 1 and stops", () => {
  const sequences = Array.from({ length: 250 }, (_, index) => index + 1);
  let beforeSequence;
  let pages = 0;
  for (;;) {
    const older = sequences.filter(
      (sequence) => beforeSequence === undefined || sequence < beforeSequence,
    );
    const rawPage = older.slice(-100);
    const meta = messagePageMeta({
      rawCount: rawPage.length,
      limit: 100,
      oldestSequence: rawPage[0],
      beforeSequence,
    });
    pages += 1;
    if (!meta.hasMore) {
      assert.equal(meta.nextBeforeSequence, undefined);
      break;
    }
    assert.ok(meta.nextBeforeSequence >= 1);
    assert.notEqual(meta.nextBeforeSequence, beforeSequence);
    beforeSequence = meta.nextBeforeSequence;
    assert.ok(pages < 10, "paging should not loop");
  }
  assert.equal(pages, 3);
});

test("listMessages builds its cursor from the raw page, before filtering", () => {
  const source = readFileSync(path.join(root, "convex/chat.ts"), "utf8");
  const start = source.indexOf("export const listMessages");
  assert.ok(start >= 0, "convex/chat.ts must export listMessages");
  const handler = source.slice(start);
  const call = handler.match(/messagePageMeta\(\{[\s\S]*?\n    \}\);/);
  assert.ok(call, "listMessages must call messagePageMeta");
  assert.match(call[0], /rawCount:\s*rawPage\.length/);
  assert.match(call[0], /oldestSequence:\s*rawPage\[0\]\?\.sequence/);
  assert.doesNotMatch(call[0], /visible/);
  const metaAt = handler.indexOf("messagePageMeta({");
  const filterAt = handler.indexOf("const visible = rawPage.filter");
  assert.ok(filterAt > metaAt, "the cursor must be computed before the filter");
  assert.match(handler, /messages: await Promise\.all\(/);
});
