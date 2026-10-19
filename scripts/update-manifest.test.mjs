import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildManifest,
  parseArgs,
  releaseNotes,
} from "./update-manifest.mjs";
import { releaseProblem } from "../convex/lib/manifest.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const packagePath = path.join(root, "package.json");

test("release notes come out as plain text for the prompt", () => {
  const notes = releaseNotes(changelog, "0.0.3");
  assert.ok(notes);
  assert.match(notes, /^The theme now follows the device/);
  assert.match(notes, /• System theme support/);
  assert.ok(!notes.includes("###"), notes);
  assert.ok(!notes.includes("**"), notes);
  assert.ok(!notes.includes("`"), notes);
  assert.ok(notes.length <= 1000);
});

test("headings, links and reference definitions do not reach the prompt", () => {
  const markdown = [
    "## [1.2.3] - 2026-01-01",
    "",
    "Lead paragraph.",
    "",
    "### Added",
    "",
    "- One with **bold** and `code`.",
    "- Two with [a link](https://example.com).",
    "",
    "[Unreleased]: https://example.com/compare",
    "",
  ].join("\n");
  assert.equal(
    releaseNotes(markdown, "1.2.3"),
    "Lead paragraph.\n\n• One with bold and code.\n• Two with a link.",
  );
});

test("hard-wrapped changelog lines are joined, list items keep their own line", () => {
  const markdown = [
    "## [1.2.3] - 2026-01-01",
    "",
    "A paragraph wrapped",
    "across three",
    "short lines.",
    "",
    "### Added",
    "",
    "- A bullet wrapped",
    "  across two lines.",
    "- A second bullet.",
    "",
    "A closing paragraph.",
    "",
  ].join("\n");
  assert.equal(
    releaseNotes(markdown, "1.2.3"),
    "A paragraph wrapped across three short lines.\n\n" +
      "• A bullet wrapped across two lines.\n" +
      "• A second bullet.\n\n" +
      "A closing paragraph.",
  );
});

test("a missing release section is reported, not invented", () => {
  assert.equal(releaseNotes(changelog, "9.9.9"), null);
  assert.equal(releaseNotes("", "0.0.3"), null);
});

test("long notes are cut at a word boundary below the server's cap", () => {
  const notes = releaseNotes(
    `## [1.0.0] - 2026-01-01\n\n${"word ".repeat(400)}`,
    "1.0.0",
    100,
  );
  assert.ok(notes.length <= 100, `${notes.length} characters`);
  assert.ok(notes.endsWith("…"), notes);
  assert.ok(!notes.includes("wor…"), notes);
});

test("the manifest hashes the file it names", () => {
  const bytes = readFileSync(packagePath);
  const manifest = buildManifest({
    apkPath: packagePath,
    apkUrl: "https://example.com/app.apk",
    versionName: "0.0.4",
    versionCode: 4,
    minVersionCode: 1,
    mandatory: false,
    notes: "Test notes.",
  });
  assert.equal(manifest.apkBytes, bytes.length);
  assert.equal(
    manifest.apkSha256,
    createHash("sha256").update(bytes).digest("hex"),
  );
  assert.equal(releaseProblem(manifest), null);
});

test("options are parsed strictly", () => {
  assert.equal(parseArgs(["--help"]).help, true);
  assert.equal(parseArgs(["--min-version-code", "3"]).minVersionCode, 3);
  assert.equal(parseArgs(["--mandatory"]).mandatory, true);
  assert.throws(() => parseArgs(["--url"]), /needs a value/);
  assert.throws(() => parseArgs(["--min-version-code", "0"]), /positive integer/);
  assert.throws(() => parseArgs(["--min-version-code", "3.5"]), /positive integer/);
  assert.throws(() => parseArgs(["--nope"]), /unknown option/);
  assert.throws(
    () => parseArgs(["--notes", "a", "--notes-file", "b"]),
    /either --notes or --notes-file/,
  );
});

test("the CLI prints one publishable JSON document and nothing else", () => {
  const appConfig = JSON.parse(readFileSync(path.join(root, "app.json"), "utf8"));
  const output = execFileSync(
    process.execPath,
    [
      path.join(root, "scripts", "update-manifest.mjs"),
      packagePath,
      "--url",
      "https://example.com/app.apk",
      "--notes",
      "Test notes.",
    ],
    { encoding: "utf8" },
  );
  assert.equal(output.trim().split("\n").length, 1);
  const manifest = JSON.parse(output);
  assert.equal(manifest.versionCode, appConfig.expo.android.versionCode);
  assert.equal(manifest.versionName, appConfig.expo.version);
  assert.equal(manifest.minVersionCode, 1);
  assert.equal(manifest.mandatory, false);
  assert.equal(manifest.notes, "Test notes.");
  assert.equal(releaseProblem(manifest), null);
});
