/**
 * One place that knows how messenger data is stored.
 *
 * Screens and hooks never touch storage keys: they read and write these typed
 * slices. Chats, messages, media metadata, stories, the outbox, call history,
 * settings and gallery markers live in SQLite; the startup theme, the dismissed
 * release and the pending incoming call stay in AsyncStorage. Adding a backend
 * later means adding a network-backed implementation of the same calls (see
 * docs/ARCHITECTURE.md), not editing UI code.
 */

import { asyncStorageDriver, STORE_NAMESPACE } from "./asyncStorage";
import { openMessengerDatabase } from "./sqlite/database";
import { createMessengerRepository } from "./sqlite/repository";
import { createStore } from "./store";

export { asyncStorageDriver, STORE_NAMESPACE };
export { createMessengerRepository };
export type { MessengerRepository } from "./sqlite/repository";

const store = createStore(asyncStorageDriver, STORE_NAMESPACE);

/** Shared instance: every reader hits the same database and memory cache. */
export const messengerRepository = createMessengerRepository(
  store,
  openMessengerDatabase(),
);
