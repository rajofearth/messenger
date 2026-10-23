#!/usr/bin/env node
// Builds the JSON that `convex run --prod releases:publish` expects, from a
// real APK and the matching CHANGELOG entry.
//
//   node scripts/update-manifest.mjs [apk] --url <https url>
//        [--version-name <name>] [--version-code N]
//        [--min-version-code N] [--mandatory]
//        [--notes <text> | --notes-file <path>]
//
// Version values default to app.json for a production release. A development
// build passes both explicitly because its version is generated per build.
//
// Without an APK path it reads artifacts/release/messenger-<version>-arm64-v8a.apk,
// which is what the release workflow collects. Only the JSON goes to stdout, so
// a workflow can capture it directly; everything a human needs goes to stderr.
//
// The release workflow runs this after the GitHub release exists, because the
// manifest contains the asset URL GitHub has just created.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { releaseProblem } from "../convex/lib/manifest.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const NOTES_LIMIT = 1000;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * CHANGELOG paragraphs are hard-wrapped at 80 columns, which would reach the
 * prompt as ragged breaks in the middle of sentences. Wrapped lines are joined
 * back into their paragraph, while every list item keeps a line of its own.
 */
function reflow(lines) {
  const blocks = [];
  let open = null;

  const flush = () => {
    if (open !== null) blocks.push(open);
    open = null;
  };

  for (const line of lines) {
    if (line === "") {
      flush();
      continue;
    }
    if (line.startsWith("• ")) flush();
    if (open !== null) open.text = `${open.text} ${line}`;
    else open = { bullet: line.startsWith("• "), text: line };
  }
  flush();

  return blocks
    .map((block, index) => {
      if (index === 0) return block.text;
      const previousItem = blocks[index - 1].bullet && block.bullet;
      return `${previousItem ? "\n" : "\n\n"}${block.text}`;
    })
    .join("");
}

/**
 * The `## [version]` section of CHANGELOG.md as plain text, or null when the
 * version has no section. Headings and reference links are dropped because the
 * notes are shown in a plain text prompt, not rendered as Markdown.
 */
export function releaseNotes(markdown, version, limit = NOTES_LIMIT) {
  if (!Number.isInteger(limit) || limit < 16) {
    throw new Error("the notes limit must be an integer of at least 16");
  }
  const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\][^\\n]*\\n`, "m");
  const match = heading.exec(markdown);
  if (!match) return null;

  const body = markdown.slice(match.index + match[0].length);
  const next = body.search(/^## /m);
  const section = next === -1 ? body : body.slice(0, next);
  const text = reflow(
    section
      .replace(/<!--[\s\S]*?-->/g, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => !line.startsWith("###"))
      // Link definitions such as `[Unreleased]: https://...` at the file end.
      .filter((line) => !/^\[[^\]]+\]:\s/.test(line))
      .map((line) => line.replace(/^[-*]\s+/, "• "))
      .map((line) =>
        line
          .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/`([^`]+)`/g, "$1"),
      ),
  );

  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  const boundary = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(" "));
  const kept = boundary > limit / 2 ? cut.slice(0, boundary) : cut;
  return `${kept.trimEnd()}…`;
}

/** Hashes the bytes the server will serve, so the manifest describes the file. */
export function buildManifest({
  apkPath,
  apkUrl,
  versionName,
  versionCode,
  minVersionCode,
  mandatory,
  notes,
}) {
  const apkBytes = statSync(apkPath).size;
  const apkSha256 = createHash("sha256").update(readFileSync(apkPath)).digest("hex");
  return {
    versionCode,
    versionName,
    apkUrl,
    apkSha256,
    apkBytes,
    minVersionCode,
    mandatory,
    notes,
  };
}

export function parseArgs(argv) {
  const options = {
    apk: undefined,
    url: undefined,
    versionName: undefined,
    versionCode: undefined,
    minVersionCode: 1,
    mandatory: false,
    notes: undefined,
    notesFile: undefined,
    help: false,
  };
  const value = (index, option) => {
    const next = argv[index];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`${option} needs a value`);
    }
    return next;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--url") {
      options.url = value((index += 1), argument);
    } else if (argument === "--version-name") {
      const next = value((index += 1), argument).trim();
      if (!next) throw new Error("--version-name must not be empty");
      options.versionName = next;
    } else if (argument === "--version-code") {
      const raw = value((index += 1), argument);
      const parsed = Number(raw);
      if (
        !/^\d+$/.test(raw) ||
        !Number.isSafeInteger(parsed) ||
        parsed < 1 ||
        parsed > 2_100_000_000
      ) {
        throw new Error("--version-code must be an integer between 1 and 2100000000");
      }
      options.versionCode = parsed;
    } else if (argument === "--min-version-code") {
      const raw = value((index += 1), argument);
      const parsed = Number(raw);
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(parsed) || parsed < 1) {
        throw new Error("--min-version-code must be a positive integer");
      }
      options.minVersionCode = parsed;
    } else if (argument === "--mandatory") {
      options.mandatory = true;
    } else if (argument === "--notes") {
      options.notes = value((index += 1), argument);
    } else if (argument === "--notes-file") {
      options.notesFile = value((index += 1), argument);
    } else if (argument.startsWith("--")) {
      throw new Error(`unknown option ${argument}`);
    } else if (options.apk !== undefined) {
      throw new Error(`unexpected argument ${argument}`);
    } else {
      options.apk = argument;
    }
  }

  if (options.notes !== undefined && options.notesFile !== undefined) {
    throw new Error("pass either --notes or --notes-file, not both");
  }
  return options;
}

export function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(
      "Usage: node scripts/update-manifest.mjs [apk] --url <https url> " +
        "[--version-name <name>] [--version-code N] " +
        "[--min-version-code N] [--mandatory] [--notes <text> | --notes-file <path>]",
    );
    return;
  }

  const appConfig = JSON.parse(readFileSync(path.join(root, "app.json"), "utf8"));
  const versionName = options.versionName ?? appConfig.expo?.version;
  const versionCode = options.versionCode ?? appConfig.expo?.android?.versionCode;
  if (typeof versionName !== "string" || versionName.trim().length === 0) {
    throw new Error("app.json has no expo.version and --version-name was not passed");
  }
  if (!Number.isInteger(versionCode) || versionCode < 1) {
    throw new Error("app.json has no positive expo.android.versionCode and --version-code was not passed");
  }
  if (!options.url) {
    throw new Error("--url is required: it is the release asset URL the app downloads");
  }
  if (!/^https:\/\//i.test(options.url) || /\s/.test(options.url)) {
    throw new Error("--url must be an https URL without whitespace");
  }
  if (options.minVersionCode > versionCode) {
    throw new Error(
      `--min-version-code ${options.minVersionCode} is above the app's version code ${versionCode}`,
    );
  }

  const apkPath = path.resolve(
    options.apk ??
      path.join(
        root,
        "artifacts",
        "release",
        `messenger-${versionName}-arm64-v8a.apk`,
      ),
  );
  if (!existsSync(apkPath)) {
    throw new Error(
      `no APK at ${apkPath}; build one with npm run android:build or pass a path`,
    );
  }

  let notes = options.notes;
  if (notes === undefined) {
    const notesFile = options.notesFile
      ? path.resolve(options.notesFile)
      : path.join(root, "CHANGELOG.md");
    notes = releaseNotes(readFileSync(notesFile, "utf8"), versionName);
    if (notes === null) {
      throw new Error(
        `${notesFile} has no "## [${versionName}]" section; write the release notes or pass --notes`,
      );
    }
  }

  const manifest = buildManifest({
    apkPath,
    apkUrl: options.url.trim(),
    versionName,
    versionCode,
    minVersionCode: options.minVersionCode,
    mandatory: options.mandatory,
    notes: notes.trim(),
  });
  const problem = releaseProblem(manifest);
  if (problem) {
    throw new Error(`the server would reject this manifest: ${problem}`);
  }
  process.stdout.write(`${JSON.stringify(manifest)}\n`);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`update-manifest: ${error.message}`);
    process.exit(1);
  }
}
