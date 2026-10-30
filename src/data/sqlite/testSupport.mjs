import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const modules = new Map();

/** Loads a TypeScript module by compiling it for CommonJS. */
function load(relative) {
  const file = path.resolve(here, relative);
  const cached = modules.get(file);
  if (cached) return cached.exports;
  const module = { exports: {} };
  modules.set(file, module);
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const require = (specifier) => {
    if (!specifier.startsWith(".")) {
      throw new Error(`Missing module mock: ${specifier} (from ${file})`);
    }
    const target = path.resolve(path.dirname(file), specifier);
    return load(path.relative(here, target.endsWith(".ts") ? target : `${target}.ts`));
  };
  new Function("require", "exports", "module", compiled)(
    require,
    module.exports,
    module,
  );
  return module.exports;
}

export const schema = load("schema.ts");
export const repository = load("repository.ts");
export const { createStore } = load("../store.ts");

const NAMESPACE = "messenger/v2";

function createDatabase() {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  return {
    raw,
    execAsync: async (source) => raw.exec(source),
    runAsync: async (source, ...params) => {
      const result = raw.prepare(source).run(...params);
      return { changes: Number(result.changes) };
    },
    getFirstAsync: async (source, ...params) =>
      raw.prepare(source).get(...params) ?? null,
    getAllAsync: async (source, ...params) => raw.prepare(source).all(...params),
    withTransactionAsync: async (task) => {
      raw.exec("BEGIN");
      try {
        await task();
        raw.exec("COMMIT");
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function memoryDriver() {
  const data = new Map();
  return {
    data,
    read: async (key) => data.get(key) ?? null,
    write: async (key, value) => {
      if (value === null) data.delete(key);
      else data.set(key, value);
    },
    keys: async () => [...data.keys()],
  };
}

/** A fresh in-memory database with the current schema and its repository. */
export async function setup() {
  const database = createDatabase();
  await schema.applySchema(database);
  const driver = memoryDriver();
  const store = createStore(driver, NAMESPACE);
  return {
    database,
    driver,
    store,
    repository: repository.createMessengerRepository(
      store,
      Promise.resolve(database),
    ),
  };
}

let clock = 1_700_000_000_000;

export function chat(id, patch = {}) {
  return {
    id,
    name: `Chat ${id}`,
    avatar: "",
    preview: "hello",
    time: "10:00",
    unread: 0,
    color: "#123456",
    ...patch,
  };
}

export function message(id, sequence, patch = {}) {
  return {
    id,
    text: `text ${id}`,
    mine: false,
    time: "10:00",
    sequence,
    createdAt: new Date((clock += 1000)).toISOString(),
    ...patch,
  };
}

export function pending(id, patch = {}) {
  return {
    id,
    text: `text ${id}`,
    mine: true,
    time: "10:00",
    status: "sending",
    createdAt: new Date((clock += 1000)).toISOString(),
    ...patch,
  };
}
