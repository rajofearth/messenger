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
};

export const STORE_VERSION = "v2";

export function createStore(driver: StorageDriver, namespace: string): Store {
  const memory = new Map<string, unknown>();
  const reading = new Map<string, Promise<unknown>>();
  const queue = new Map<string, string | null>();
  const writes = new Map<string, Promise<void>>();
  const full = (key: string) => `${namespace}/${key}`;

  async function drain(): Promise<void> {
    while (queue.size) {
      const [key, value] = queue.entries().next().value as [
        string,
        string | null,
      ];
      queue.delete(key);
      const write = driver.write(key, value);
      writes.set(key, write);
      try {
        await write;
      } finally {
        writes.delete(key);
      }
    }
  }

  let flushing: Promise<void> = Promise.resolve();

  function schedule(): Promise<void> {
    flushing = flushing.then(drain).catch(drain);
    return flushing;
  }

  return {
    peek: <T>(key: string) => memory.get(key) as T | undefined,
    load: async <T>(key: string) => {
      if (memory.has(key)) return memory.get(key) as T;
      const pending = reading.get(key) as Promise<T | undefined> | undefined;
      if (pending) return pending;
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
          memory.set(key, value);
          return value as T | undefined;
        })
        .finally(() => {
          reading.delete(key);
        });
      reading.set(key, request);
      return request;
    },
    save: async <T>(key: string, value: T | null) => {
      memory.set(key, value ?? undefined);
      queue.set(full(key), value === null ? null : JSON.stringify(value));
      await schedule();
    },
    keys: () => driver.keys(),
    flush: () => schedule(),
  };
}
