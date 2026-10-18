import test from "node:test";
import assert from "node:assert/strict";
import { createCache, cacheKey } from "./cache.ts";

const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

test("a cached value is returned without calling the loader again", async () => {
  const cache = createCache();
  let loads = 0;
  const load = () => cache.load("av", async () => {
    loads += 1;
    return "value";
  });
  assert.equal(await load(), "value");
  assert.equal(await load(), "value");
  assert.equal(loads, 1);
  assert.equal(cache.get("av"), "value");
  assert.equal(cache.has("av"), true);
  assert.equal(cache.has("missing"), false);
});

test("concurrent callers share one in-flight load", async () => {
  const cache = createCache();
  let loads = 0;
  const loader = async () => {
    loads += 1;
    await tick();
    return loads;
  };
  const [a, b, c] = await Promise.all([
    cache.load("story", loader),
    cache.load("story", loader),
    cache.load("story", loader),
  ]);
  assert.equal(loads, 1);
  assert.deepEqual([a, b, c], [1, 1, 1]);
});

test("a failed load is not cached and can be retried", async () => {
  const cache = createCache();
  let loads = 0;
  const loader = async () => {
    loads += 1;
    if (loads === 1) throw new Error("offline");
    return "recovered";
  };
  await assert.rejects(() => cache.load("profile", loader), /offline/);
  assert.equal(cache.has("profile"), false);
  assert.equal(await cache.load("profile", loader), "recovered");
  assert.equal(loads, 2);
});

test("entries honour their lifetime and expire from the key list", async () => {
  const cache = createCache();
  cache.set("short", 1, 5);
  cache.set("forever", 2);
  assert.equal(cache.get("short"), 1);
  await tick(20);
  assert.equal(cache.get("short"), undefined);
  assert.equal(cache.get("forever"), 2);
  assert.deepEqual(cache.keys(), ["forever"]);
});

test("a zero lifetime never expires, matching the module default", async () => {
  const cache = createCache({ ttlMs: 0 });
  cache.set("media", "local-file");
  await tick(20);
  assert.equal(cache.get("media"), "local-file");
});

test("reads refresh recency so the least recently used entry is evicted", () => {
  const cache = createCache({ max: 2 });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.get("a");
  cache.set("c", 3);
  assert.equal(cache.get("b"), undefined);
  assert.deepEqual([cache.get("a"), cache.get("c")], [1, 3]);
  assert.deepEqual(cache.keys(), ["a", "c"]);
  assert.equal(cache.size(), 2);
});

test("delete, clear and overwrite keep the cache consistent", async () => {
  const cache = createCache({ max: 1 });
  cache.set("one", "first");
  cache.set("one", "second");
  assert.equal(cache.get("one"), "second");
  assert.equal(cache.size(), 1);
  cache.delete("one");
  assert.equal(cache.get("one"), undefined);
  cache.set("two", 2);
  cache.clear();
  assert.deepEqual(cache.keys(), []);
  assert.equal(cache.size(), 0);
  assert.equal(await cache.load("three", async () => 3), 3);
});

test("cache keys are short, stable and safe to use as file names", () => {
  const url = "https://images.unsplash.com/photo-1524504388940?w=200";
  const key = cacheKey(url);
  assert.equal(key, cacheKey(url));
  assert.match(key, /^[0-9a-z]+$/);
  assert.notEqual(key, cacheKey(`${url}&q=80`));
  assert.ok(key.length <= 8);
});
