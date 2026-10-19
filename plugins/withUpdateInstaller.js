const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require("@expo/config-plugins");

// Android does not let an app install a package the way it installs a file:
// three things have to be in place, and Expo generates none of them.
//
//   1. REQUEST_INSTALL_PACKAGES, so Android lets the app ask the user to
//      install a downloaded package at all. Without it the install intent is
//      silently dropped.
//   2. A FileProvider, because since Android 7 an app cannot hand a `file://`
//      URI to another app; `ACTION_VIEW` has to receive a `content://` URI.
//   3. A paths file for that provider. It exposes only the `updates/`
//      directory the updater downloads into, so the rest of the cache and all
//      app-private files stay unreachable.
//
// The provider authority is derived from the application id, so a debug build
// never shares the release build's authority.
const PROVIDER_AUTHORITY = "${applicationId}.fileprovider";
const PATHS_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Written by plugins/withUpdateInstaller.js. Only the downloaded update
     APKs inside cache/updates are shared with Android's package installer;
     nothing else in the cache is exposed. -->
<paths>
  <cache-path name="updates" path="updates/" />
</paths>
`;

function withInstallPermission(config) {
  return AndroidConfig.Permissions.withPermissions(config, [
    "android.permission.REQUEST_INSTALL_PACKAGES",
  ]);
}

function withUpdateProvider(config) {
  return withAndroidManifest(config, (config) => {
    const application =
      AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    const existing = application.provider ?? [];
    if (
      existing.some(
        (provider) =>
          provider.$?.["android:authorities"] === PROVIDER_AUTHORITY,
      )
    ) {
      return config;
    }
    application.provider = [
      ...existing,
      {
        $: {
          "android:name": "androidx.core.content.FileProvider",
          "android:authorities": PROVIDER_AUTHORITY,
          "android:exported": "false",
          "android:grantUriPermissions": "true",
        },
        "meta-data": [
          {
            $: {
              "android:name": "android.support.FILE_PROVIDER_PATHS",
              "android:resource": "@xml/file_paths",
            },
          },
        ],
      },
    ];
    return config;
  });
}

function withUpdateProviderPaths(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const file = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/res/xml/file_paths.xml",
      );
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, PATHS_XML);
      return config;
    },
  ]);
}

module.exports = function withUpdateInstaller(config) {
  return withUpdateProviderPaths(withUpdateProvider(withInstallPermission(config)));
};
