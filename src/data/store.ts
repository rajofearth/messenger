/**
 * Typed, namespaced persistence with a memory cache in front of storage.
 *
 * Every slice of app data is stored under its own key with its own version, so
 * writing one conversation never rewrites the whole app state and a read after
 * the first one is served from memory. Writes are coalesced per key and issued
 * in order, which keeps rapid state changes from stacking disk work.
 */

export type StorageDriver = {
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string | null) => Promise<void>;
  keys: () => Promise<string[]>;
};

export type Store = {
  /** Parsed value from memory, or undefined before the first load. */
  peek: <T>(key: string) => T | undefined;
  /** Reads storage once, then serves the cached value. */
  load: <T>(key: string) => Promise<T | undefined>;
  /** Writes through memory and storage. `null` removes the key. */
  save: <T>(key: string, value: T | null) => Promise<void>;
  keys: () => Promise<string[]>;
  flush: () => Promise<void>;
  /** Removes every slice in this namespace, including in-memory values. */
  clear: () => Promise<void>;
};

export const STORE_VERSION = "v2";

export function createStore(driver: StorageDriver, namespace: string): Store {
  const memory = new Map<string, unknown>();
  const reading = new Map<string, Promise<unknown>>();
  const generations = new Map<string, number>();
  type QueuedWrite = {
    value: string | null;
    failed: boolean;
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: unknown) => void;
  };
  const queue = new Map<string, QueuedWrite>();
  const full = (key: string) => `${namespace}/${key}`;

  async function drain(): Promise<void> {
    const attempted = new Set<QueuedWrite>();
    let failed = false;
    let firstError: unknown;

    while (true) {
      const next = [...queue.entries()].find(
        ([, write]) => !attempted.has(write),
      );
      if (!next) break;

      const [key, queued] = next;
      attempted.add(queued);
      queue.delete(key);
      try {
        await driver.write(key, queued.value);
        queued.resolve();
      } catch (error) {
        failed = true;
        firstError ??= error;
        queued.failed = true;
        queued.reject(error);
        // Keep the failed value queued so a later flush/save can retry it, but
        // do not replace a newer value saved while this write was in flight.
        if (!queue.has(key)) queue.set(key, queued);
      }
    }

    if (failed) {
      throw firstError;
    }
  }

  function queuedWrite(value: string | null): QueuedWrite {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    return { value, failed: false, promise, resolve, reject };
  }

  let flushing: Promise<void> | null = null;

  function schedule(): Promise<void> {
    if (flushing) return flushing;

    const run = Promise.resolve().then(drain);
    const scheduled = run.finally(() => {
      if (flushing !== scheduled) return;
      flushing = null;
      // A save can land after the last drain pass but before this callback
      // runs. Failed writes stay queued for an explicit flush instead, so only
      // a fresh, unattempted value starts another pass.
      if ([...queue.values()].some((write) => !write.failed)) {
        void schedule().catch(() => undefined);
      }
    });
    flushing = scheduled;
    return scheduled;
  }

  return {
    peek: <T>(key: string) => memory.get(key) as T | undefined,
    load: async <T>(key: string) => {
      if (memory.has(key)) return memory.get(key) as T;
      const pending = reading.get(key) as Promise<T | undefined> | undefined;
      if (pending) return pending;
      const generation = generations.get(key) ?? 0;
      const request = driver
        .read(full(key))
        .then((raw) => {
          if (raw === null) return undefined;
          try {
            return JSON.parse(raw) as T;
          } catch {
            // A corrupt slice is dropped rather than blocking the whole app.
            void driver.write(full(key), null);
            return undefined;
          }
        })
        .then((value) => {
          if ((generations.get(key) ?? 0) === generation) memory.set(key, value);
          return value as T | undefined;
        })
        .finally(() => {
          // A clear() may have replaced this request with a newer read.
          if (reading.get(key) === request) reading.delete(key);
        });
      reading.set(key, request);
      return request;
    },
    save: async <T>(key: string, value: T | null) => {
      generations.set(key, (generations.get(key) ?? 0) + 1);
      memory.set(key, value ?? undefined);
      const storageKey = full(key);
      const serialized = value === null ? null : JSON.stringify(value);
      let queued = queue.get(storageKey);
      if (!queued || queued.failed) {
        queued = queuedWrite(serialized);
        queue.set(storageKey, queued);
      } else {
        queued.value = serialized;
      }
      void schedule().catch(() => undefined);
      await queued.promise;
    },
    keys: () => driver.keys(),
    flush: () => schedule(),
    clear: async () => {
      await schedule().catch(() => undefined);
      const prefix = `${namespace}/`;
      const queuedKeys = [...queue.keys()];
      queue.clear();
      // Memory and in-flight reads can hold data that never reached storage,
      // so include them as well as the keys the driver reports.
      const keys = new Set([
        ...memory.keys(),
        ...reading.keys(),
        ...queuedKeys.map((key) => key.slice(prefix.length)),
        ...(await driver.keys())
          .filter((key) => key.startsWith(prefix))
          .map((key) => key.slice(prefix.length)),
      ]);
      for (const key of keys) {
        await driver.write(full(key), null);
      }
      // Invalidate reads only after the deletes land, so a read that started
      // during the loop cannot put the old value back into memory.
      for (const key of keys) {
        generations.set(key, (generations.get(key) ?? 0) + 1);
        memory.delete(key);
      }
      reading.clear();
    },
  };
}
