import test from "node:test";
import assert from "node:assert/strict";
import {
  MEDIA_PAGE_SIZE,
  mergeMediaPage,
  nextMediaPageWindow,
} from "./mediaPickerPaging.ts";

let nextId = 0;
function asset(modificationTime, id = `asset-${nextId++}`) {
  return { id, modificationTime };
}

/** A store page: newest first, with undated rows after every dated row. */
function mediaStore(entries) {
  return entries.map((time, index) => asset(time, `asset-${index}`));
}

/** Mirrors the native query: inclusive time cursor, or an offset slice. */
function fetchPage(library, window) {
  const rows =
    window.mode === "offset"
      ? library.slice(window.offset)
      : window.cursor === null
        ? library
        : library.filter(
            (item) =>
              item.modificationTime !== null && item.modificationTime <= window.cursor,
          );
  return rows.slice(0, window.limit);
}

test("the first page asks for one sentinel row and no cursor", () => {
  assert.deepEqual(nextMediaPageWindow([]), {
    mode: "cursor",
    cursor: null,
    limit: MEDIA_PAGE_SIZE + 1,
  });
});

test("the cursor is inclusive and reserves room for rows sharing its timestamp", () => {
  const loaded = [asset(500), asset(400), asset(400), asset(300)];
  assert.deepEqual(nextMediaPageWindow(loaded, 2), {
    mode: "cursor",
    cursor: 300,
    limit: 4,
  });
  assert.deepEqual(nextMediaPageWindow([asset(500)], 20), {
    mode: "cursor",
    cursor: 500,
    limit: 22,
  });
});

test("merging drops ids already shown and stops on the last page", () => {
  const loaded = [asset(6, "a"), asset(5, "b"), asset(4, "c")];
  const fetched = [asset(4, "c"), asset(3, "d"), asset(2, "e"), asset(1, "f")];
  const page = mergeMediaPage(loaded, fetched, 3);
  assert.deepEqual(
    page.assets.map((item) => item.modificationTime),
    [6, 5, 4, 3, 2, 1],
  );
  assert.equal(page.added, 3);
  assert.equal(page.hasMore, false);

  const partial = mergeMediaPage(loaded, [asset(4, "c"), asset(3, "d"), asset(2, "e")], 3);
  assert.equal(partial.added, 2);
  assert.equal(partial.hasMore, false);

  const more = mergeMediaPage(loaded, fetched, 2);
  assert.equal(more.added, 2);
  assert.equal(more.hasMore, true);
  assert.equal(more.assets.length, 5);
});

test("merging never mutates the inputs", () => {
  const loaded = Object.freeze([Object.freeze(asset(2))]);
  const fetched = Object.freeze([Object.freeze(asset(1))]);
  const merged = mergeMediaPage(loaded, fetched, MEDIA_PAGE_SIZE);
  assert.notEqual(merged.assets, loaded);
  assert.equal(loaded.length, 1);
  assert.equal(fetched.length, 1);
});

test("a photo inserted between pages cannot make a cursor page skip a row", () => {
  // 25 files were in the store when the picker opened.
  const original = mediaStore(
    Array.from({ length: 25 }, (_, index) => 1_000 - index),
  );
  const first = fetchPage(original, nextMediaPageWindow([]));
  let state = mergeMediaPage([], first, 10);
  assert.equal(state.assets.length, 10);
  assert.equal(state.hasMore, true);

  // Two new files are saved before the second page is requested. They sort
  // above every already-read row, so the cursor does not return them yet;
  // what matters is that no row from the original snapshot is skipped.
  const store = [asset(2_000, "new-a"), asset(1_999, "new-b"), ...original];
  while (state.hasMore) {
    const window = nextMediaPageWindow(state.assets, 10);
    const merged = mergeMediaPage(state.assets, fetchPage(store, window), 10);
    assert.ok(merged.added > 0 || window.mode === "offset");
    state = merged;
  }
  const ids = new Set(state.assets.map((item) => item.id));
  assert.equal(state.assets.length, 25);
  for (const item of original) assert.ok(ids.has(item.id), item.id);
  assert.equal(ids.has("new-a"), false);

  // A refresh resets the list and re-reads the newest page, which is where
  // the two new files appear.
  const refreshed = mergeMediaPage([], fetchPage(store, nextMediaPageWindow([])), 10);
  assert.equal(refreshed.assets[0].id, "new-a");
  assert.equal(refreshed.assets[1].id, "new-b");
});

test("a deletion between pages cannot make a cursor page skip a remaining row", () => {
  const original = mediaStore(
    Array.from({ length: 25 }, (_, index) => 1_000 - index),
  );
  let state = mergeMediaPage([], fetchPage(original, nextMediaPageWindow([])), 10);
  assert.equal(state.assets.length, 10);

  // The two newest rows are deleted before the next page is requested. They
  // may stay on screen until the next refresh, but every remaining row must
  // still be reachable.
  const store = original.slice(2);
  while (state.hasMore) {
    const window = nextMediaPageWindow(state.assets, 10);
    state = mergeMediaPage(state.assets, fetchPage(store, window), 10);
  }
  const ids = new Set(state.assets.map((item) => item.id));
  for (const item of store) assert.ok(ids.has(item.id), item.id);

  // A refresh drops the deleted rows and starts again from the newest row.
  const refreshed = mergeMediaPage([], fetchPage(store, nextMediaPageWindow([])), 10);
  assert.equal(refreshed.assets[0].id, "asset-2");
  assert.equal(refreshed.assets.length, 10);
});

test("a whole library saved in the same second is still read exactly once", () => {
  const store = mediaStore(Array.from({ length: 25 }, () => 1_000));
  let state = mergeMediaPage([], fetchPage(store, nextMediaPageWindow([])), 10);
  assert.equal(state.assets.length, 10);
  assert.equal(state.hasMore, true);
  while (state.hasMore) {
    const window = nextMediaPageWindow(state.assets, 10);
    const merged = mergeMediaPage(state.assets, fetchPage(store, window), 10);
    state = merged;
  }
  assert.equal(state.assets.length, 25);
  assert.equal(new Set(state.assets.map((item) => item.id)).size, 25);
});

test("rows without a modification time are collected after the dated rows", () => {
  // Ten dated files and three files whose DATE_MODIFIED is missing. SQLite
  // sorts the undated rows last and `<=` never matches NULL, so the cursor
  // alone cannot reach them; the picker falls back to an offset once the
  // dated rows are exhausted.
  const store = mediaStore([
    ...Array.from({ length: 10 }, (_, index) => 1_000 - index),
    null,
    null,
    null,
  ]);
  let state = mergeMediaPage([], fetchPage(store, nextMediaPageWindow([])), 10);
  assert.equal(state.assets.length, 10);
  assert.equal(state.hasMore, true);

  const window = nextMediaPageWindow(state.assets, 10);
  assert.equal(window.mode, "cursor");
  const cursorPage = mergeMediaPage(state.assets, fetchPage(store, window), 10);
  assert.equal(cursorPage.added, 0);
  assert.equal(cursorPage.hasMore, false);
  assert.equal(cursorPage.assets.length, 10);

  const tail = mergeMediaPage(
    state.assets,
    fetchPage(store, { mode: "offset", offset: 10, limit: 11 }),
    10,
  );
  assert.equal(tail.added, 3);
  assert.equal(tail.hasMore, false);
  assert.equal(tail.assets.length, 13);
  assert.deepEqual(
    tail.assets.slice(10).map((item) => item.modificationTime),
    [null, null, null],
  );

  // Once the undated tail is being read, the window switches to offsets.
  state = tail;
  assert.deepEqual(nextMediaPageWindow(state.assets, 10), {
    mode: "offset",
    offset: 13,
    limit: 11,
  });
});
