/**
 * Opens the one database connection and prepares it for first use.
 *
 * This is the only module that imports `expo-sqlite`; everything else talks to
 * the structural `SqlDatabase` type, which keeps the data layer testable under
 * Node. The connection promise is shared for the life of the process, and a
 * failed open is cleared so a later attempt can retry.
 */

import { openDatabaseAsync } from "expo-sqlite";
import { applySchema } from "./schema";
import type { SqlDatabase } from "./types";

export const DATABASE_NAME = "messenger.db";

const PRAGMAS = `PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;`;

let opening: Promise<SqlDatabase> | undefined;

async function open(): Promise<SqlDatabase> {
  const connection = await openDatabaseAsync(DATABASE_NAME, {
    useNewConnection: true,
  });
  await connection.execAsync(PRAGMAS);
  await applySchema(connection);
  return connection;
}

/** The shared connection, opened and checked against the schema on first call. */
export function openMessengerDatabase(): Promise<SqlDatabase> {
  if (!opening) {
    opening = open().catch((error: unknown) => {
      opening = undefined;
      throw error;
    });
  }
  return opening;
}
