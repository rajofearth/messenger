// Expo reads this file when it exists. Production deliberately stays a plain
// copy of app.json; setting APP_VARIANT=dev changes only the installed identity
// and the update feed, never the production configuration.
//
// Dev builds are a separate package so Android installs them beside Messenger,
// and a separate feed so a dev APK is never offered to production clients. The
// feed URL is supplied by scripts/android.mjs; a direct `expo prebuild` cannot
// accidentally build a dev APK that checks the production feed because this
// file refuses to build without an explicit dev feed.
const base = require("./app.json").expo;

const MAX_VERSION_CODE = 2_100_000_000;

function variantName() {
  const value = (process.env.APP_VARIANT ?? "production").trim().toLowerCase();
  if (value === "" || value === "production" || value === "prod") return "production";
  if (value === "dev" || value === "development") return "dev";
  throw new Error(`APP_VARIANT must be production or dev, not ${process.env.APP_VARIANT}`);
}

function positiveVersionCode(value) {
  if (value === undefined || value.trim() === "") return null;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`APP_VERSION_CODE must be a positive integer, not ${value}`);
  }
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_VERSION_CODE) {
    throw new Error(`APP_VERSION_CODE must be between 1 and ${MAX_VERSION_CODE}`);
  }
  return parsed;
}

function timestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `.${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function normalizeUrl(value) {
  const url = new URL(value);
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function devFeedUrl() {
  const value = process.env.EXPO_PUBLIC_DEV_UPDATE_FEED_URL?.trim();
  if (!value) {
    throw new Error(
      "APP_VARIANT=dev requires EXPO_PUBLIC_DEV_UPDATE_FEED_URL; " +
        "use npm run android:dev:build so the URL is derived from the dev Convex deployment",
    );
  }
  if (!/^https:\/\//i.test(value) || /\s/.test(value)) {
    throw new Error("EXPO_PUBLIC_DEV_UPDATE_FEED_URL must be an https URL without whitespace");
  }
  const production = process.env.EXPO_PUBLIC_UPDATE_FEED_URL?.trim();
  if (production && normalizeUrl(value) === normalizeUrl(production)) {
    throw new Error(
      "refusing to build a dev APK against the production update feed; " +
        "EXPO_PUBLIC_DEV_UPDATE_FEED_URL must point at the development deployment",
    );
  }
  return value;
}

module.exports = () => {
  if (variantName() !== "dev") return base;

  const updateFeedUrl = devFeedUrl();
  const now = new Date();
  const versionCode =
    positiveVersionCode(process.env.APP_VERSION_CODE) ?? Math.floor(now.getTime() / 1000);
  if (versionCode > MAX_VERSION_CODE) {
    throw new Error(`the generated dev versionCode ${versionCode} is too large for Android`);
  }
  const versionName =
    process.env.APP_VERSION_NAME?.trim() || `${base.version}-dev.${timestamp(now)}`;
  if (versionName.length > 32 || /\s/.test(versionName)) {
    throw new Error("APP_VERSION_NAME must be at most 32 characters with no whitespace");
  }

  return {
    ...base,
    name: "Messenger Dev",
    scheme: "messenger-dev",
    version: versionName,
    icon: "./assets/dev/icon.png",
    android: {
      ...base.android,
      package: "com.yashraj.messenger.dev",
      versionCode,
      adaptiveIcon: {
        backgroundColor: "#FFF1D6",
        foregroundImage: "./assets/dev/android-icon-foreground.png",
        backgroundImage: "./assets/dev/android-icon-background.png",
        monochromeImage: "./assets/dev/android-icon-monochrome.png",
      },
    },
    web: {
      ...base.web,
      favicon: "./assets/dev/favicon.png",
    },
    extra: {
      ...base.extra,
      appVariant: "dev",
      updateFeedUrl,
    },
  };
};
