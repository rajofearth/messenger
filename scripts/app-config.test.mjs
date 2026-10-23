import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const appConfig = require("../app.config.js");
const base = JSON.parse(readFileSync(path.join(root, "app.json"), "utf8")).expo;
const envKeys = [
  "APP_VARIANT",
  "APP_VERSION_CODE",
  "APP_VERSION_NAME",
  "EXPO_PUBLIC_APP_VARIANT",
  "EXPO_PUBLIC_DEV_UPDATE_FEED_URL",
  "EXPO_PUBLIC_UPDATE_FEED_URL",
];

function withEnvironment(values, run) {
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  Object.assign(process.env, values);
  try {
    return run();
  } finally {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("without APP_VARIANT the config is the production app.json unchanged", () => {
  withEnvironment({}, () => {
    assert.deepEqual(appConfig(), base);
  });
});

test("the dev variant has its own identity and icon set", () => {
  withEnvironment(
    {
      APP_VARIANT: "dev",
      APP_VERSION_CODE: "1780000000",
      APP_VERSION_NAME: "0.1.1-dev.20261022.120000",
      EXPO_PUBLIC_DEV_UPDATE_FEED_URL:
        "https://striped-finch-559.convex.site/updates/manifest",
      EXPO_PUBLIC_UPDATE_FEED_URL:
        "https://beloved-deer-524.convex.site/updates/manifest",
    },
    () => {
      const config = appConfig();
      assert.equal(config.name, "Messenger Dev");
      assert.equal(config.scheme, "messenger-dev");
      assert.equal(config.version, "0.1.1-dev.20261022.120000");
      assert.equal(config.icon, "./assets/dev/icon.png");
      assert.equal(config.android.package, "com.yashraj.messenger.dev");
      assert.equal(config.android.versionCode, 1780000000);
      assert.equal(config.android.adaptiveIcon.foregroundImage, "./assets/dev/android-icon-foreground.png");
      assert.equal(config.extra.appVariant, "dev");
      assert.equal(
        config.extra.updateFeedUrl,
        "https://striped-finch-559.convex.site/updates/manifest",
      );
    },
  );
});

test("a dev build refuses the production update feed", () => {
  const feed = "https://beloved-deer-524.convex.site/updates/manifest";
  withEnvironment(
    {
      APP_VARIANT: "dev",
      APP_VERSION_CODE: "1780000000",
      APP_VERSION_NAME: "0.1.1-dev.1",
      EXPO_PUBLIC_DEV_UPDATE_FEED_URL: feed,
      EXPO_PUBLIC_UPDATE_FEED_URL: feed,
    },
    () => {
      assert.throws(() => appConfig(), /production update feed/);
    },
  );
});

test("a dev build refuses to start without a feed", () => {
  withEnvironment(
    {
      APP_VARIANT: "dev",
      APP_VERSION_CODE: "1780000000",
      APP_VERSION_NAME: "0.1.1-dev.1",
    },
    () => {
      assert.throws(() => appConfig(), /EXPO_PUBLIC_DEV_UPDATE_FEED_URL/);
    },
  );
});
