/**
 * The SQLite surface the data layer uses.
 *
 * Nothing here imports `expo-sqlite`: the repository, the migrations and the
 * tests talk to this structural type, and `database.ts` is the only file that
 * hands over a real expo connection.
 */

export type SqlValue = string | number | null;

/** The part of expo-sqlite's run result this layer reads. */
export type SqlRunResult = {
  changes: number;
};

export type SqlDatabase = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SqlValue[]): Promise<SqlRunResult>;
  getFirstAsync<T>(source: string, ...params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};
