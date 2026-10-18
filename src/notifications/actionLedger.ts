/**
 * Remembers which notification actions have already been handled.
 *
 * Android delivers actions at least once: a crash between handling and
 * acknowledgement redelivers them. Reply actions use this ledger so the same
 * queued reply is never sent twice.
 */

import { asyncStorageDriver } from "../data/messengerRepository";
import { createStore, type Store } from "../data/store";

const KEY = "handled-actions";
const LIMIT = 200;

export type ActionLedger = {
  hydrate: () => Promise<void>;
  has: (id: string) => Promise<boolean>;
  record: (ids: string[]) => Promise<void>;
  /** Removes every recorded action, for a full local reset. */
  clear: () => Promise<void>;
};

export function createActionLedger(
  store: Store = createStore(asyncStorageDriver, "notifications/v1"),
): ActionLedger {
  let handled: string[] = [];
  let hydration: Promise<void> | null = null;
  let writes: Promise<void> = Promise.resolve();

  function hydrate(): Promise<void> {
    if (!hydration) {
      hydration = store
        .load<string[]>(KEY)
        .then((saved) => {
          if (Array.isArray(saved)) {
            handled = saved.filter((id) => typeof id === "string").slice(-LIMIT);
          }
        })
        .catch(() => {
          // A failed read only risks a duplicate reply, never data loss.
        });
    }
    return hydration;
  }

  return {
    hydrate,
    has: async (id: string) => {
      await hydrate();
      return handled.includes(id);
    },
    record: async (ids: string[]) => {
      await hydrate();
      const next = [...handled.filter((id) => !ids.includes(id)), ...ids].slice(-LIMIT);
      // A failed write must reject so the caller leaves the action
      // unacknowledged, and must not poison the chain for later writes.
      const write = writes.catch(() => {}).then(() => store.save(KEY, next));
      writes = write.catch(() => {});
      await write;
      handled = next;
    },
    clear: async () => {
      handled = [];
      hydration = null;
      await store.save(KEY, null);
    },
  };
}

/** Shared instance so live events and pending snapshots share one ledger. */
export const actionLedger = createActionLedger();
