import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function harness(options = {}) {
  const calls = [];
  const deleted = [];
  class Directory {
    constructor(root, name) {
      this.root = root.uri;
      this.name = name;
      this.uri = `${root.uri}${name}/`;
      this.exists = !(options.missing ?? []).includes(name);
    }
    delete() {
      if ((options.throwing ?? []).includes(this.name)) {
        throw new Error(`Cannot delete ${this.name}`);
      }
      deleted.push(`${this.root}${this.name}`);
    }
  }
  const modules = {
    "expo-file-system": {
      Directory,
      Paths: {
        document: { uri: "file:///documents/" },
        cache: { uri: "file:///cache/" },
      },
    },
    "../data/avatars": {
      clearAvatarCache: () => {
        calls.push("clearAvatarCache");
        if (options.avatarClearThrows) throw new Error("Cache unavailable");
      },
    },
    "./appUpdater": {
      isAppUpdaterAvailable: options.updaterAvailable ?? true,
      clearDownloads: async () => {
        calls.push("clearDownloads");
        return { deleted: 1 };
      },
    },
  };
  const compiled = ts.transpileModule(
    readFileSync(new URL("./accountCleanup.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    assert.ok(name in modules, `Missing mock: ${name}`);
    return modules[name];
  }, exports);
  return { ...exports, calls, deleted };
}

test("sign-out clears the avatar cache and every local media folder", async () => {
  const app = harness();
  await app.clearLocalAccountFiles();
  assert.deepEqual(app.calls, ["clearAvatarCache", "clearDownloads"]);
  assert.deepEqual(app.deleted, [
    "file:///documents/messenger-media",
    "file:///documents/message-media",
    "file:///cache/avatars",
  ]);
});

test("folders that are already gone are skipped", async () => {
  const app = harness({ missing: ["messenger-media", "avatars"] });
  await app.clearLocalAccountFiles();
  assert.deepEqual(app.deleted, ["file:///documents/message-media"]);
});

test("the update APK is cleared only when the updater is available", async () => {
  const available = harness();
  await available.clearLocalAccountFiles();
  assert.ok(available.calls.includes("clearDownloads"));

  const unavailable = harness({ updaterAvailable: false });
  await unavailable.clearLocalAccountFiles();
  assert.equal(unavailable.calls.includes("clearDownloads"), false);
});

test("a directory that cannot be deleted does not reject sign-out", async () => {
  const app = harness({ throwing: ["messenger-media"] });
  await assert.doesNotReject(app.clearLocalAccountFiles());
  // The failure is contained so the remaining folders are still cleaned.
  assert.deepEqual(app.deleted, [
    "file:///documents/message-media",
    "file:///cache/avatars",
  ]);
});

test("an avatar cache failure still removes the other folders", async () => {
  const app = harness({ avatarClearThrows: true });
  await assert.doesNotReject(app.clearLocalAccountFiles());
  assert.deepEqual(app.deleted, [
    "file:///documents/messenger-media",
    "file:///documents/message-media",
    "file:///cache/avatars",
  ]);
});
