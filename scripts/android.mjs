import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pruneExtraDensities } from "./prune-densities.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const action = argv[0];
if (!["build", "install"].includes(action)) {
  throw new Error("Usage: node scripts/android.mjs build|install [--variant dev]");
}

function option(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} needs a value`);
  }
  return value;
}

function normalizeVariant(raw) {
  const value = (raw ?? "production").trim().toLowerCase();
  if (value === "" || value === "production" || value === "prod") return "production";
  if (value === "dev" || value === "development") return "dev";
  throw new Error(`variant must be production or dev, not ${raw}`);
}

function readEnvFile(file) {
  if (!existsSync(file)) return {};
  const values = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    values[match[1]] = value;
  }
  return values;
}

function setting(localEnv, name) {
  return process.env[name]?.trim() || localEnv[name]?.trim();
}

function httpsUrl(value, name) {
  if (!value) throw new Error(`${name} is required`);
  if (!/^https:\/\//i.test(value) || /\s/.test(value)) {
    throw new Error(`${name} must be an https URL without whitespace`);
  }
  return value;
}

function normalizeUrl(value) {
  const url = new URL(value);
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function stamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `.${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function versionCodeFromEnvironment() {
  const raw = process.env.APP_VERSION_CODE?.trim();
  if (!raw) return Math.floor(Date.now() / 1000);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`APP_VERSION_CODE must be a positive integer, not ${raw}`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2_100_000_000) {
    throw new Error("APP_VERSION_CODE must be between 1 and 2100000000");
  }
  return parsed;
}

const variant = normalizeVariant(option("--variant") ?? process.env.APP_VARIANT);
const dev = variant === "dev";
const appConfig = JSON.parse(readFileSync(path.join(root, "app.json"), "utf8")).expo;
const localEnv = readEnvFile(path.join(root, ".env.local"));
const packageId = dev ? "com.yashraj.messenger.dev" : appConfig.android.package;
const artifact = path.join(root, "artifacts", dev ? "messenger-dev.apk" : "messenger-local.apk");

const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  "P:/Applications/Android/Sdk";
const java = process.env.JAVA_HOME || "P:/Applications/jdk-17.0.17+10";
const env = {
  ...process.env,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  JAVA_HOME: java,
  NODE_ENV: "production",
  EXPO_NO_GIT_STATUS: "1",
  APP_VARIANT: variant,
};

let versionName = appConfig.version;
let versionCode = appConfig.android.versionCode;
let updateFeedUrl;
if (dev) {
  const convexUrl = httpsUrl(setting(localEnv, "EXPO_PUBLIC_CONVEX_URL"), "EXPO_PUBLIC_CONVEX_URL");
  const convexSiteUrl = httpsUrl(
    setting(localEnv, "EXPO_PUBLIC_CONVEX_SITE_URL"),
    "EXPO_PUBLIC_CONVEX_SITE_URL",
  );
  const cloudSlug = new URL(convexUrl).hostname.split(".")[0];
  const siteSlug = new URL(convexSiteUrl).hostname.split(".")[0];
  if (cloudSlug !== siteSlug) {
    throw new Error(
      "EXPO_PUBLIC_CONVEX_URL and EXPO_PUBLIC_CONVEX_SITE_URL point at different deployments",
    );
  }
  const deployment = setting(localEnv, "CONVEX_DEPLOYMENT");
  if (deployment) {
    if (!deployment.startsWith("dev:")) {
      throw new Error(
        "refusing to build the dev app against a non-dev Convex deployment; " +
          "set CONVEX_DEPLOYMENT=dev:<deployment>",
      );
    }
    const deploymentSlug = deployment.slice("dev:".length).split(/[\s#]/)[0];
    if (deploymentSlug && deploymentSlug !== siteSlug) {
      throw new Error(
        `CONVEX_DEPLOYMENT says ${deploymentSlug} but the Convex URLs use ${siteSlug}`,
      );
    }
  }

  updateFeedUrl = httpsUrl(
    process.env.EXPO_PUBLIC_DEV_UPDATE_FEED_URL?.trim() ||
      `${convexSiteUrl.replace(/\/+$/, "")}/updates/manifest`,
    "EXPO_PUBLIC_DEV_UPDATE_FEED_URL",
  );
  const productionFeedUrl = setting(localEnv, "EXPO_PUBLIC_UPDATE_FEED_URL");
  if (productionFeedUrl) {
    httpsUrl(productionFeedUrl, "EXPO_PUBLIC_UPDATE_FEED_URL");
    if (
      normalizeUrl(updateFeedUrl) === normalizeUrl(productionFeedUrl) ||
      new URL(updateFeedUrl).host === new URL(productionFeedUrl).host
    ) {
      throw new Error(
        "the dev update feed and the production update feed share a deployment; " +
          "refusing to let dev releases reach production clients",
      );
    }
  }

  versionCode = versionCodeFromEnvironment();
  versionName =
    process.env.APP_VERSION_NAME?.trim() || `${appConfig.version}-dev.${stamp(new Date())}`;
  if (versionName.length > 32 || /\s/.test(versionName)) {
    throw new Error("the dev versionName must be at most 32 characters with no whitespace");
  }
  env.APP_VERSION_CODE = String(versionCode);
  env.APP_VERSION_NAME = versionName;
  env.EXPO_PUBLIC_APP_VARIANT = "dev";
  env.EXPO_PUBLIC_DEV_UPDATE_FEED_URL = updateFeedUrl;
  env.EXPO_PUBLIC_CONVEX_URL = convexUrl;
  env.EXPO_PUBLIC_CONVEX_SITE_URL = convexSiteUrl;
} else {
  delete env.EXPO_PUBLIC_APP_VARIANT;
  delete env.EXPO_PUBLIC_DEV_UPDATE_FEED_URL;
  delete env.APP_VERSION_CODE;
  delete env.APP_VERSION_NAME;
}

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

if (action === "install") {
  const adb = path.join(sdk, "platform-tools", "adb.exe");
  if (!existsSync(adb)) throw new Error(`ADB not found at ${adb}. Set ANDROID_HOME.`);
  if (!existsSync(artifact)) {
    throw new Error(
      `Build the ${dev ? "development" : "production"} APK first with ` +
        `npm run ${dev ? "android:dev:build" : "android:build"}.`,
    );
  }
  // ANDROID_SERIAL can select a phone when multiple devices are connected.
  run(adb, ["install", "-r", artifact]);
  run(adb, ["shell", "am", "start", "-n", `${packageId}/.MainActivity`]);
} else {
  for (const required of [
    path.join(java, "bin", "java.exe"),
    path.join(sdk, "platforms", "android-36", "android.jar"),
    path.join(sdk, "build-tools", "36.0.0", "aapt2.exe"),
    path.join(sdk, "ndk", "27.1.12297006", "source.properties"),
  ]) {
    if (!existsSync(required)) throw new Error(`Missing Android build prerequisite: ${required}`);
  }

  const android = path.join(root, "android");
  const gradlew = path.join(android, "gradlew.bat");
  const markerPath = path.join(android, ".messenger-build.json");
  const devKeystoreCache = path.join(root, "artifacts", "messenger-dev-debug.keystore");
  const wanted = { variant, packageId, versionName, versionCode, updateFeedUrl };
  let marker = null;
  if (existsSync(markerPath)) {
    try {
      marker = JSON.parse(readFileSync(markerPath, "utf8"));
    } catch {
      marker = null;
    }
  }
  const sameBuild =
    existsSync(gradlew) &&
    marker !== null &&
    marker.variant === wanted.variant &&
    marker.packageId === wanted.packageId &&
    marker.versionName === wanted.versionName &&
    marker.versionCode === wanted.versionCode &&
    marker.updateFeedUrl === wanted.updateFeedUrl;

  if (!sameBuild) {
    // android/ is generated; a package or version change has to start from a
    // clean Expo config or Gradle keeps the old applicationId and manifest.
    // Keep the debug keystore across that clean so the new APK can install
    // over the previous one. The dev copy survives deleting android/ by hand.
    const keystore = path.join(android, "app", "debug.keystore");
    const savedKeystore = existsSync(keystore)
      ? readFileSync(keystore)
      : dev && existsSync(devKeystoreCache)
        ? readFileSync(devKeystoreCache)
        : null;
    if (existsSync(android)) rmSync(android, { recursive: true, force: true });
    run(process.execPath, [
      "node_modules/expo/bin/cli",
      "prebuild",
      "--platform",
      "android",
      "--no-install",
    ]);
    if (savedKeystore) {
      mkdirSync(path.dirname(keystore), { recursive: true });
      writeFileSync(keystore, savedKeystore);
    }
    writeFileSync(markerPath, `${JSON.stringify(wanted, null, 2)}\n`);
  }

  writeFileSync(
    path.join(android, "local.properties"),
    `sdk.dir=${sdk.replaceAll("\\", "/").replaceAll(":", "\\:")}\n`,
  );
  // Runs on both paths: a fresh prebuild writes five densities, and a reused
  // android/ tree is already pruned, so this is a no-op the second time.
  const pruned = pruneExtraDensities(android);
  console.log(`Pruned ${pruned.files} launcher/splash files (${pruned.bytes} B)`);
  run(
    "cmd.exe",
    [
      "/d",
      "/s",
      "/c",
      "gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --console=plain --max-workers=2",
    ],
    android,
  );
  mkdirSync(path.dirname(artifact), { recursive: true });
  copyFileSync(
    path.join(android, "app", "build", "outputs", "apk", "release", "app-release.apk"),
    artifact,
  );
  if (dev) {
    const keystore = path.join(android, "app", "debug.keystore");
    if (existsSync(keystore)) {
      mkdirSync(path.dirname(devKeystoreCache), { recursive: true });
      copyFileSync(keystore, devKeystoreCache);
    }
  }

  const apkBytes = statSync(artifact).size;
  const apkSha256 = createHash("sha256").update(readFileSync(artifact)).digest("hex");
  if (dev) {
    const metadata = {
      variant,
      packageId,
      versionName,
      versionCode,
      updateFeedUrl,
      apk: artifact,
      apkBytes,
      apkSha256,
      builtAt: new Date().toISOString(),
    };
    writeFileSync(
      path.join(root, "artifacts", "messenger-dev.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
    console.log(`\nMessenger Dev APK: ${artifact}`);
    console.log(`Version: ${versionName} (${versionCode})`);
    console.log(`Package: ${packageId}`);
    console.log(`Update feed: ${updateFeedUrl}`);
    console.log("Install this first build manually, then use the in-app updater.");
    console.log("Updates are published with npm run dev:ship.");
  } else {
    console.log(`\nStandalone test APK: ${artifact}`);
    console.log("This APK uses the generated debug signing key. Do not publish it to a store.");
  }
}
