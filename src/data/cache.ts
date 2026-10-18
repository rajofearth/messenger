/**
 * Small typed cache with optional expiry and single-flight loading.
 *
 * Single-flight matters more than raw speed here: avatars, conversation
 * snapshots and notification payloads are requested from several screens at
 * once, and a caller should never make the same expensive call twice.
 */

type Entry<T> = {
  value: T;
  /** Unix milliseconds. `null` never expires. */
  expiresAt: number | null;
};

export type CacheOptions = {
  /** Maximum retained entries. Least recently used entries are evicted first. */
  max?: number;
  /** Default lifetime in milliseconds. 0 or undefined means no expiry. */
  ttlMs?: number;
};

export type Cache<T> = {
  get: (key: string) => T | undefined;
  has: (key: string) => boolean;
  set: (key: string, value: T, ttlMs?: number) => void;
  delete: (key: string) => void;
  clear: () => void;
  /** Cached value, else run `load` once for concurrent callers. Failures are not cached. */
  load: (key: string, load: () => Promise<T>, ttlMs?: number) => Promise<T>;
  keys: () => string[];
  size: () => number;
};

export function createCache<T>({
  max = 128,
  ttlMs = 0,
}: CacheOptions = {}): Cache<T> {
  const entries = new Map<string, Entry<T>>();
  const inflight = new Map<string, Promise<unknown>>();

  function alive(entry: Entry<T>): boolean {
    return entry.expiresAt === null || entry.expiresAt > Date.now();
  }

  /** Map iteration order is insertion order, so re-insert to refresh recency. */
  function touch(key: string, entry: Entry<T>) {
    entries.delete(key);
    entries.set(key, entry);
  }

  function evict() {
    while (entries.size > max) {
      const oldest = entries.keys().next();
      if (oldest.done) return;
      entries.delete(oldest.value);
    }
  }

  function get(key: string): T | undefined {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (!alive(entry)) {
      entries.delete(key);
      return undefined;
    }
    touch(key, entry);
    return entry.value;
  }

  async function load(
    key: string,
    loader: () => Promise<T>,
    lifetimeMs = ttlMs,
  ): Promise<T> {
    const cached = get(key);
    if (cached !== undefined) return cached;
    const pending = inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
    const request = loader()
      .then((value) => {
        entries.set(key, {
          value,
          expiresAt: lifetimeMs > 0 ? Date.now() + lifetimeMs : null,
        });
        evict();
        return value;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, request);
    return request;
  }

  return {
    get,
    has: (key) => get(key) !== undefined,
    set: (key, value, lifetimeMs = ttlMs) => {
      entries.set(key, {
        value,
        expiresAt: lifetimeMs > 0 ? Date.now() + lifetimeMs : null,
      });
      evict();
    },
    delete: (key) => {
      entries.delete(key);
    },
    clear: () => {
      entries.clear();
      inflight.clear();
    },
    load,
    keys: () => [...entries.keys()].filter((key) => get(key) !== undefined),
    size: () => entries.size,
  };
}

/** Stable key for a URL or file URI, safe to use as a file name. */
export function cacheKey(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
