#!/usr/bin/env node
// The slim-build gate for releases. `npm run release:check` runs the
// typecheck, the test suite and this script; the release workflow runs it
// against the CI APK. What each check protects is written up in AGENTS.md.
//
//   node scripts/release-check.mjs [apk] [--baseline <bytes>] [--baseline-label <name>]
//
// Without an argument it inspects artifacts/messenger-local.apk, which is what
// `npm run android:build` writes. Exits non-zero when a check fails, so a
// bloated or mismatched build cannot be published.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));

// Hard ceiling for the published APK. v0.0.3 shipped at 14.23 MiB; a build
// over this line has gained more than a megabyte over budget and has to be
// slimmed, or the budget changed deliberately in AGENTS.md.
const SIZE_BUDGET = 16 * 1024 * 1024;
const REQUIRED_ABI = "arm64-v8a";
// MLKit barcode scanning was removed in 0.0.2 and took about 8 MiB with it.
// The native library must not come back without a feature that needs it.
const FORBIDDEN_LIBRARIES = ["libbarhopper_v3.so"];

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(
    "Usage: node scripts/release-check.mjs [apk] [--baseline <bytes>] [--baseline-label <name>]",
  );
  process.exit(0);
}

let apkArgument;
let baseline;
let baselineLabel = "the previous release";
for (let index = 0; index < argv.length; index += 1) {
  const argument = argv[index];
  if (argument === "--baseline") {
    baseline = Number(argv[index + 1]);
    index += 1;
  } else if (argument === "--baseline-label") {
    baselineLabel = argv[index + 1];
    index += 1;
  } else if (argument.startsWith("--")) {
    console.error(`Unknown option: ${argument}`);
    process.exit(2);
  } else if (apkArgument) {
    console.error(`Unexpected argument: ${argument}`);
    process.exit(2);
  } else {
    apkArgument = argument;
  }
}

const mib = (bytes) => `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
const grouped = (bytes) => bytes.toLocaleString("en-US");

let passed = 0;
const failures = [];
const warnings = [];
function ok(message) {
  passed += 1;
  console.log(`  [ok] ${message}`);
}
function fail(message, hint) {
  failures.push(message);
  console.log(`  [fail] ${message}`);
  if (hint) console.log(`         ${hint}`);
}
function warn(message) {
  warnings.push(message);
  console.log(`  [warn] ${message}`);
}

const appConfig = JSON.parse(readFileSync(path.join(root, "app.json"), "utf8"));
const packageConfig = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const version = appConfig.expo.version;
console.log(`Release check for Messenger ${version}`);

if (packageConfig.version === version) {
  ok(`app.json and package.json both say ${version}`);
} else {
  fail(
    `app.json says ${version} but package.json says ${packageConfig.version}`,
    "bump both in the release commit",
  );
}

const apkPath = apkArgument
  ? path.resolve(apkArgument)
  : path.join(root, "artifacts", "messenger-local.apk");
const shownPath =
  path.relative(root, apkPath).split(path.sep).join("/") || apkPath;

if (!existsSync(apkPath)) {
  if (apkArgument) {
    fail(`no APK at ${shownPath}`);
  } else {
    warn(`no APK at ${shownPath}; build one with \`npm run android:build\` or pass a path`);
  }
  report();
}

const size = statSync(apkPath).size;
const entries = readZipEntries(apkPath);
console.log(`  inspecting ${shownPath} (${grouped(size)} bytes)`);

// Size budget and growth against the previous release.
if (size <= SIZE_BUDGET) {
  ok(`size ${mib(size)} is under the ${mib(SIZE_BUDGET)} budget`);
} else {
  fail(
    `size ${mib(size)} is over the ${mib(SIZE_BUDGET)} budget`,
    "slim the build before releasing, or revisit the budget in AGENTS.md and docs/PERFORMANCE.md",
  );
}
if (Number.isFinite(baseline) && baseline > 0) {
  const delta = size - baseline;
  const percent = ((delta / baseline) * 100).toFixed(1);
  if (delta > 0) {
    warn(
      `${grouped(delta)} bytes (+${percent}%) bigger than ${baselineLabel}; shrink it or explain the growth in CHANGELOG.md and docs/PERFORMANCE.md`,
    );
  } else {
    ok(`${grouped(-delta)} bytes (${percent}%) smaller than ${baselineLabel}`);
  }
}

// Native side: one ABI, and nothing that was deliberately removed.
const libraries = entries.filter((entry) => entry.name.startsWith("lib/"));
const abis = [...new Set(libraries.map((entry) => entry.name.split("/")[1]))].sort();
if (abis.length === 1 && abis[0] === REQUIRED_ABI) {
  ok(`single ABI ${REQUIRED_ABI} with ${libraries.length} native libraries`);
} else {
  fail(
    `native libraries target ${abis.join(", ") || "no ABI"}; release builds ship ${REQUIRED_ABI} only`,
    "build with -PreactNativeArchitectures=arm64-v8a like the release workflow does",
  );
}
const resurrected = FORBIDDEN_LIBRARIES.filter((name) =>
  libraries.some((entry) => entry.name.endsWith(`/${name}`)),
);
if (resurrected.length === 0) {
  ok("no deliberately removed native libraries are back");
} else {
  fail(
    `removed native libraries reappeared: ${resurrected.join(", ")}`,
    "this is the MLKit barcode stack that 0.0.2 removed; only keep it for a feature that needs it",
  );
}

// Startup: the JavaScript bundle has to stay stored so Android can mmap it.
const bundle = entries.find((entry) => entry.name === "assets/index.android.bundle");
if (!bundle) {
  fail("assets/index.android.bundle is missing; this is not a runnable release APK");
} else {
  ok(`JavaScript bundle present (${mib(bundle.size)})`);
  if (bundle.method === 0) {
    ok("bundle is stored uncompressed, so Android can mmap it at startup");
  } else {
    fail(
      "bundle is compressed inside the APK, which costs startup time",
      "keep assets/index.android.bundle stored (docs/PERFORMANCE.md); if the trade-off changed on purpose, update this check, the docs and the release notes",
    );
  }
}

// Content summary, useful whenever the size moved.
const dex = entries.filter((entry) => /^classes\d*\.dex$/.test(entry.name));
const resources = entries.find((entry) => entry.name === "resources.arsc");
const dexBytes = dex.reduce((total, entry) => total + entry.size, 0);
console.log(
  `  [info] ${entries.length} entries, ${dex.length} dex (${mib(dexBytes)}), ` +
    `${libraries.length} libraries, resources.arsc ${resources ? mib(resources.size) : "missing"}`,
);

// aapt2 adds the checks that need the binary manifest: locales and version.
const aapt2 = findAapt2();
if (!aapt2) {
  warn(
    "aapt2 was not found, so the locale and versionName checks were skipped (set ANDROID_HOME or AAPT2)",
  );
} else {
  try {
    const badging = execFileSync(aapt2, ["dump", "badging", apkPath], { encoding: "utf8" });
    const versionName = /versionName='([^']*)'/.exec(badging)?.[1];
    if (versionName === version) {
      ok(`APK reports versionName ${versionName}`);
    } else {
      fail(`APK reports versionName ${versionName ?? "unknown"} but app.json says ${version}`);
    }
    const configurations = execFileSync(aapt2, ["dump", "configurations", apkPath], {
      encoding: "utf8",
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const locales = configurations.filter(
      (configuration) =>
        configuration !== "car" && // UI mode, not a language
        (/^[a-z]{2,3}(?:-r[A-Z]{2})?(?:-|$)/.test(configuration) ||
          configuration.startsWith("b+")),
    );
    if (locales.length === 0) {
      ok(`no locale-specific resources (${configurations.length} configurations, English only)`);
    } else {
      fail(
        `locale resources are back: ${locales.slice(0, 6).join(", ")}${locales.length > 6 ? ", ..." : ""}`,
        'the resConfigs "en" plugin in plugins/withEnglishOnlyResources.js is not applied; prebuild and rebuild',
      );
    }
  } catch (error) {
    warn(`aapt2 checks were skipped: ${String(error.message).split("\n")[0]}`);
  }
}

report();

function report() {
  console.log();
  if (failures.length === 0) {
    console.log(`Release check passed: ${passed} checks, ${warnings.length} warning(s).`);
  } else {
    console.log(`Release check failed: ${failures.length} of ${passed + failures.length} checks.`);
    for (const failure of failures) console.log(`  - ${failure}`);
  }
  for (const warning of warnings) console.log(`  ! ${warning}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

function readZipEntries(file) {
  const data = readFileSync(file);
  const last = Math.max(0, data.length - 66_000);
  let end;
  for (let offset = data.length - 22; offset >= last; offset -= 1) {
    if (data.readUInt32LE(offset) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  if (end === undefined) throw new Error(`${file} is not a zip archive`);
  if (data.readUInt32LE(end + 16) === 0xffffffff) {
    throw new Error(`${file} uses zip64, which this check does not support`);
  }
  const count = data.readUInt16LE(end + 10);
  let offset = data.readUInt32LE(end + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    if (data.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`${file} has a corrupt central directory`);
    }
    const nameLength = data.readUInt16LE(offset + 28);
    const extraLength = data.readUInt16LE(offset + 30);
    const commentLength = data.readUInt16LE(offset + 32);
    entries.push({
      name: data.toString("utf8", offset + 46, offset + 46 + nameLength),
      method: data.readUInt16LE(offset + 10),
      size: data.readUInt32LE(offset + 24),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findAapt2() {
  const candidates = [];
  if (process.env.AAPT2) candidates.push(process.env.AAPT2);
  const sdks = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT].filter(Boolean);
  // android/ is generated but gitignored files like local.properties can still
  // say where the SDK lives, which saves setting an environment variable.
  const localProperties = path.join(root, "android", "local.properties");
  if (existsSync(localProperties)) {
    const match = /^sdk\.dir=(.+)$/m.exec(readFileSync(localProperties, "utf8"));
    if (match) {
      sdks.push(match[1].trim().replace(/\\:/g, ":").replace(/\\\\/g, "\\"));
    }
  }
  const executable = process.platform === "win32" ? "aapt2.exe" : "aapt2";
  for (const sdk of sdks) {
    const buildTools = path.join(sdk, "build-tools");
    if (!existsSync(buildTools)) continue;
    const versions = readdirSync(buildTools).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
    for (const version of versions.reverse()) {
      const candidate = path.join(buildTools, version, executable);
      if (existsSync(candidate)) candidates.push(candidate);
    }
  }
  candidates.push("aapt2");
  return candidates.find((candidate) => candidate === "aapt2" || existsSync(candidate));
}
