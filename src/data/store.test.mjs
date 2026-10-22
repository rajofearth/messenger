import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.ts";

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test("save rejects when the storage write fails and can be retried", async () => {
  let attempts = 0;
  const values = new Map();
  const store = createStore({
    read: async (key) => values.get(key) ?? null,
    write: async (key, value) => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
      if (value === null) values.delete(key);
      else values.set(key, value);
    },
    keys: async () => [],
  }, "test");

  await assert.rejects(store.save("profile", { name: "Alex" }), /offline/);
  await store.flush();
  assert.equal(values.get("test/profile"), JSON.stringify({ name: "Alex" }));
  assert.equal(attempts, 2);
});

test("a failed key does not reject an independent save", async () => {
  const values = new Map();
  let failed = false;
  const store = createStore({
    read: async (key) => values.get(key) ?? null,
    write: async (key, value) => {
      if (key === "test/broken" && !failed) {
        failed = true;
        throw new Error("broken key");
      }
      if (value === null) values.delete(key);
      else values.set(key, value);
    },
    keys: async () => [...values.keys()],
  }, "test");

  const broken = store.save("broken", { value: 1 });
  const healthy = store.save("healthy", { value: 2 });

  await assert.rejects(broken, /broken key/);
  await healthy;
  assert.equal(values.get("test/healthy"), JSON.stringify({ value: 2 }));
  assert.equal(values.has("test/broken"), false);
});

test("a failed key is retried by a later flush", async () => {
  const values = new Map();
  let attempts = 0;
  const store = createStore({
    read: async (key) => values.get(key) ?? null,
    write: async (key, value) => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
      if (value === null) values.delete(key);
      else values.set(key, value);
    },
    keys: async () => [...values.keys()],
  }, "test");

  await assert.rejects(
    store.save("profile", { name: "Alex", count: 2 }),
    /offline/,
  );
  assert.equal(values.has("test/profile"), false);

  await store.flush();
  assert.equal(
    values.get("test/profile"),
    JSON.stringify({ name: "Alex", count: 2 }),
  );
  assert.equal(attempts, 2);
});

test("clear drops memory keys that never reached storage", async () => {
  const values = new Map();
  let fail = true;
  const store = createStore({
    read: async (key) => values.get(key) ?? null,
    write: async (key, value) => {
      if (fail) throw new Error("offline");
      if (value === null) values.delete(key);
      else values.set(key, value);
    },
    keys: async () => [...values.keys()],
  }, "test");

  await assert.rejects(store.save("profile", { name: "Alex" }), /offline/);
  assert.deepEqual(store.peek("profile"), { name: "Alex" });

  fail = false;
  await store.clear();
  assert.equal(store.peek("profile"), undefined);
  assert.equal(await store.load("profile"), undefined);
});

test("an in-flight read cannot replace a value saved after it started", async () => {
  const oldRead = deferred();
  const values = new Map([["test/thread", JSON.stringify(["old"])]]);
  const store = createStore({
    read: async (key) => {
      if (key === "test/thread") return oldRead.promise;
      return values.get(key) ?? null;
    },
    write: async (key, value) => {
      if (value === null) values.delete(key);
      else values.set(key, value);
    },
    keys: async () => [...values.keys()],
  }, "test");

  const loading = store.load("thread");
  await store.save("thread", ["new"]);
  oldRead.resolve(JSON.stringify(["old"]));
  assert.deepEqual(await loading, ["old"]);
  assert.deepEqual(await store.load("thread"), ["new"]);
});
