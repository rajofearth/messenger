#!/usr/bin/env node
// Builds a development APK and publishes it to the dev-only update channel:
// a GitHub prerelease for the bytes, and the development Convex deployment for
// the manifest. Production releases are untouched.
//
//   node scripts/dev-release.mjs [--no-build] [--dry-run] [--notes <text>]
//
// The first dev APK still has to be installed by hand. Every later build can
// be installed through the in-app updater.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { releaseProblem } from "../convex/lib/manifest.ts";
import { buildManifest } from "./update-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);

function option(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} needs a value`);
  }
  return value;
}

const noBuild = argv.includes("--no-build");
const dryRun = argv.includes("--dry-run");
const notesArgument = option("--notes");
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(
    "Usage: node scripts/dev-release.mjs [--no-build] [--dry-run] [--notes <text>]",
  );
  process.exit(0);
}
for (const argument of argv) {
  if (
    argument.startsWith("--") &&
    !["--no-build", "--dry-run", "--notes", "--help", "-h"].includes(argument)
  ) {
    throw new Error(`unknown option ${argument}`);
  }
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

function run(command, args, { capture = false, env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? `\n${(result.stderr || "").trim()}` : "";
    throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}${detail}`);
  }
  return result.stdout ?? "";
}

if (!noBuild) {
  run(process.execPath, [path.join(root, "scripts", "android.mjs"), "build", "--variant", "dev"]);
}

const metadataPath = path.join(root, "artifacts", "messenger-dev.json");
if (!existsSync(metadataPath)) {
  throw new Error(
    "no dev build metadata at artifacts/messenger-dev.json; run npm run android:dev:build first",
  );
}
const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
for (const field of ["packageId", "versionName", "versionCode", "updateFeedUrl", "apk"]) {
  if (metadata[field] === undefined || metadata[field] === null || metadata[field] === "") {
    throw new Error(`artifacts/messenger-dev.json has no ${field}`);
  }
}
if (metadata.packageId !== "com.yashraj.messenger.dev") {
  throw new Error(`refusing to publish ${metadata.packageId}; it is not the dev package`);
}
const apkPath = path.resolve(metadata.apk);
if (!existsSync(apkPath)) {
  throw new Error(`the dev APK named by the metadata is missing: ${apkPath}`);
}
const apkBytes = statSync(apkPath).size;
const apkSha256 = createHash("sha256").update(readFileSync(apkPath)).digest("hex");
if (apkBytes !== metadata.apkBytes || apkSha256 !== metadata.apkSha256) {
  throw new Error("the dev APK changed after it was built; rebuild before publishing");
}

const localEnv = readEnvFile(path.join(root, ".env.local"));
const convexSiteUrl = setting(localEnv, "EXPO_PUBLIC_CONVEX_SITE_URL");
if (!convexSiteUrl) throw new Error("EXPO_PUBLIC_CONVEX_SITE_URL is required");
const feedUrl = metadata.updateFeedUrl;
if (!/^https:\/\//i.test(feedUrl) || /\s/.test(feedUrl)) {
  throw new Error("the dev update feed in the build metadata is not a valid https URL");
}
if (new URL(feedUrl).host !== new URL(convexSiteUrl).host) {
  throw new Error(
    `the dev APK checks ${new URL(feedUrl).host}, not the development deployment ` +
      `${new URL(convexSiteUrl).host}`,
  );
}

const deployment = setting(localEnv, "CONVEX_DEPLOYMENT");
if (!deployment || !deployment.startsWith("dev:")) {
  throw new Error(
    "publishing a dev release requires CONVEX_DEPLOYMENT=dev:<deployment>; " +
      "refusing to touch the production deployment",
  );
}
const deploymentSlug = deployment.slice("dev:".length).split(/[\s#]/)[0];
if (!deploymentSlug) throw new Error("CONVEX_DEPLOYMENT has no dev deployment name");
if (new URL(convexSiteUrl).hostname !== `${deploymentSlug}.convex.site`) {
  throw new Error(
    `CONVEX_DEPLOYMENT is ${deploymentSlug} but the Convex URL is ${convexSiteUrl}`,
  );
}

run(process.execPath, [
  path.join(root, "scripts", "release-check.mjs"),
  apkPath,
  "--variant",
  "dev",
  "--version",
  metadata.versionName,
  "--version-code",
  String(metadata.versionCode),
  "--package",
  metadata.packageId,
]);

const repo = run("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], {
  capture: true,
}).trim();
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
  throw new Error(`could not read the GitHub repository name (got ${repo || "nothing"})`);
}
const tag = `dev-${metadata.versionCode}`;
const assetName = `messenger-dev-${metadata.versionName}-arm64-v8a.apk`;
const apkUrl = `https://github.com/${repo}/releases/download/${tag}/${assetName}`;
const subject = run("git", ["log", "-1", "--pretty=%s"], { capture: true }).trim();
const notes = (notesArgument ?? `Development build ${metadata.versionName}.\n\n${subject}`)
  .trim()
  .slice(0, 1000);
if (!notes) throw new Error("the dev release notes are empty");

const manifest = buildManifest({
  apkPath,
  apkUrl,
  versionName: metadata.versionName,
  versionCode: metadata.versionCode,
  minVersionCode: 1,
  mandatory: false,
  notes,
});
const problem = releaseProblem(manifest);
if (problem) throw new Error(`the dev feed would reject this release: ${problem}`);

if (dryRun) {
  console.log(`\nDry run for ${tag}`);
  console.log(JSON.stringify(manifest, null, 2));
  process.exit(0);
}

const existing = spawnSync("gh", ["release", "view", tag], {
  cwd: root,
  env: process.env,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
});
if (existing.status === 0) {
  console.log(`\nRelease ${tag} already exists; replacing its APK.`);
} else {
  const commit = run("git", ["rev-parse", "HEAD"], { capture: true }).trim();
  run("gh", [
    "release",
    "create",
    tag,
    "--target",
    commit,
    "--prerelease",
    "--title",
    `Messenger Dev ${metadata.versionName}`,
    "--notes",
    notes,
  ]);
}
// The asset name is stable for a given build, and the release endpoint is the
// URL the app downloads. `gh`'s `file#name` syntax is inconsistent with Windows
// drive paths, so stage a copy with the exact name instead.
const uploadPath = path.join(path.dirname(apkPath), assetName);
copyFileSync(apkPath, uploadPath);
run("gh", ["release", "upload", tag, uploadPath, "--clobber"]);
const assetNameOnRelease = assetName;
const uploaded = run(
  "gh",
  ["release", "view", tag, "--json", "assets", "--jq", ".assets[].name"],
  { capture: true },
)
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
if (!uploaded.includes(assetNameOnRelease)) {
  throw new Error(`GitHub release ${tag} does not contain ${assetNameOnRelease}`);
}

const convexEnv = { ...process.env };
delete convexEnv.CONVEX_DEPLOY_KEY;
run(
  process.execPath,
  [
    path.join(root, "node_modules", "convex", "bin", "main.js"),
    "run",
    "--deployment",
    deploymentSlug,
    "releases:publish",
    JSON.stringify(manifest),
  ],
  { env: convexEnv },
);

// Verify the deployment actually serves the release before telling the user to
// pick it up. versionCode=0 asks for the newest row.
const response = await fetch(`${feedUrl}?versionCode=0`, {
  headers: { accept: "application/json" },
});
if (!response.ok) {
  throw new Error(`the dev feed answered ${response.status} after publishing`);
}
const served = await response.json();
if (served.versionCode !== manifest.versionCode || served.apkSha256 !== manifest.apkSha256) {
  throw new Error("the dev feed is not serving the release that was just published");
}

console.log(`\nPublished Messenger Dev ${metadata.versionName} (${metadata.versionCode}).`);
console.log(`GitHub prerelease: https://github.com/${repo}/releases/tag/${tag}`);
console.log(`Dev feed: ${feedUrl}`);
console.log("Install the first dev APK once; later builds update from the app.");
