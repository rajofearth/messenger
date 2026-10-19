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
  assert.deepEqual(await store.load("profile"), { name: "Alex" });
  assert.equal(attempts, 2);
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
