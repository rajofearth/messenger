import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { devMappingPath, validateDevMappingBinding } from "./dev-artifact.mjs";

const root = path.resolve("test-root");
const apkSha256 = "a".repeat(64);

function metadata(overrides = {}) {
  return {
    versionCode: 123,
    apkSha256,
    mapping: devMappingPath(root, 123, apkSha256),
    mappingApkSha256: apkSha256,
    mappingVersionCode: 123,
    ...overrides,
  };
}

test("dev mapping sidecar is keyed to the exact APK and version", () => {
  const mapping = devMappingPath(root, 123, apkSha256);
  assert.match(mapping, /messenger-dev-123-a{64}-mapping\.txt$/);
  assert.doesNotThrow(() => validateDevMappingBinding(root, metadata()));
});

test("dev artifact binding rejects a mapping from another APK", () => {
  assert.throws(
    () =>
      validateDevMappingBinding(
        root,
        metadata({
          mapping: devMappingPath(root, 123, "b".repeat(64)),
          mappingApkSha256: "b".repeat(64),
        }),
      ),
    /not bound to the recorded APK|path is not bound/,
  );
  assert.throws(
    () => validateDevMappingBinding(root, metadata({ mappingVersionCode: 124 })),
    /not bound to the recorded version code/,
  );
});
