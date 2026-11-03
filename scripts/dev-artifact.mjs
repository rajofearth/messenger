import path from "node:path";

export function devMappingPath(root, versionCode, apkSha256) {
  return path.join(
    root,
    "artifacts",
    `messenger-dev-${versionCode}-${apkSha256}-mapping.txt`,
  );
}

export function validateDevMappingBinding(root, metadata) {
  if (metadata.mappingApkSha256 !== metadata.apkSha256) {
    throw new Error("the dev R8 mapping is not bound to the recorded APK");
  }
  if (metadata.mappingVersionCode !== metadata.versionCode) {
    throw new Error("the dev R8 mapping is not bound to the recorded version code");
  }
  const expected = devMappingPath(root, metadata.versionCode, metadata.apkSha256);
  if (path.resolve(metadata.mapping) !== path.resolve(expected)) {
    throw new Error(
      `the dev R8 mapping path is not bound to the recorded APK: expected ${expected}`,
    );
  }
}
