import test from "node:test";
import assert from "node:assert/strict";
import {
  canDismiss,
  decideUpdate,
  formatBytes,
  parseUpdateFeed,
  parseUpdateManifest,
  shouldPrompt,
} from "./updates.ts";

const DIGEST = "a".repeat(64);

function manifest(overrides = {}) {
  return {
    versionCode: 4,
    versionName: "0.0.4",
    apkUrl: "https://github.com/yashraj/messenger/releases/download/v0.0.4/app-release.apk",
    apkSha256: DIGEST,
    apkBytes: 14_920_000,
    minVersionCode: 1,
    mandatory: false,
    notes: "Fixes the call banner.",
    ...overrides,
  };
}

test("a published manifest parses into the fields the updater uses", () => {
  const parsed = parseUpdateManifest(manifest());
  assert.deepEqual(parsed, {
    versionCode: 4,
    versionName: "0.0.4",
    apkUrl: "https://github.com/yashraj/messenger/releases/download/v0.0.4/app-release.apk",
    apkSha256: DIGEST,
    apkBytes: 14_920_000,
    minVersionCode: 1,
    mandatory: false,
    notes: "Fixes the call banner.",
  });
});

test("legacy escaped line breaks are normalized before the prompt sees notes", () => {
  const parsed = parseUpdateManifest(
    manifest({ notes: String.raw`First paragraph.\n\n• One change.\n• Two changes.` }),
  );
  assert.ok(parsed);
  assert.equal(parsed.notes, "First paragraph.\n\n• One change.\n• Two changes.");
});

test("quoted numbers and omitted optional fields are accepted", () => {
  const parsed = parseUpdateManifest({
    versionCode: "12",
    versionName: "0.1.0",
    apkUrl: "https://example.com/app.apk",
    apkSha256: DIGEST.toUpperCase(),
    apkBytes: "14920000",
  });
  assert.ok(parsed);
  assert.equal(parsed.versionCode, 12);
  assert.equal(parsed.versionName, "0.1.0");
  assert.equal(parsed.apkSha256, DIGEST);
  assert.equal(parsed.minVersionCode, 12);
  assert.equal(parsed.mandatory, false);
  assert.equal(parsed.notes, "");
});

test("a manifest that cannot be trusted is refused whole", () => {
  const rejected = [
    manifest({ versionCode: 0 }),
    manifest({ versionCode: -3 }),
    manifest({ versionCode: 2_100_000_001 }),
    manifest({ versionCode: "four" }),
    manifest({ versionName: "" }),
    manifest({ versionName: "x".repeat(33) }),
    manifest({ apkUrl: "http://example.com/app.apk" }),
    manifest({ apkUrl: "https://user:pass@example.com/app.apk" }),
    manifest({ apkUrl: "file:///data/local/tmp/app.apk" }),
    manifest({ apkUrl: "https://" }),
    manifest({ apkUrl: `https://example.com/${"a".repeat(2048)}` }),
    manifest({ apkSha256: "a".repeat(63) }),
    manifest({ apkSha256: `${"a".repeat(63)}z` }),
    manifest({ apkSha256: null }),
    manifest({ apkBytes: 0 }),
    manifest({ apkBytes: 201 * 1024 * 1024 }),
    manifest({ apkBytes: "not a number" }),
    manifest({ minVersionCode: 5 }),
    manifest({ minVersionCode: "0" }),
    manifest({ mandatory: "yes" }),
    manifest({ notes: 12 }),
    manifest({ notes: "n".repeat(1001) }),
  ];
  for (const value of rejected) {
    assert.equal(parseUpdateManifest(value), null, JSON.stringify(value));
  }
  assert.equal(parseUpdateManifest(null), null);
  assert.equal(parseUpdateManifest("4"), null);
  assert.equal(parseUpdateManifest([manifest()]), null);
});

test("the feed is either up to date or a manifest, never anything else", () => {
  assert.deepEqual(parseUpdateFeed({ upToDate: true }), { status: "current" });
  const release = parseUpdateFeed(manifest());
  assert.equal(release?.status, "release");
  assert.equal(parseUpdateFeed({}), null);
  assert.equal(parseUpdateFeed({ upToDate: false }), null);
  assert.equal(parseUpdateFeed("<html>404</html>"), null);
  assert.equal(parseUpdateFeed(null), null);
});

test("an unreadable feed is never offered as an update", () => {
  const installed = { versionName: "0.0.3", versionCode: 3 };
  assert.deepEqual(decideUpdate(null, installed), { status: "unknown" });
  assert.deepEqual(decideUpdate({ status: "current" }, installed), {
    status: "current",
  });
});

test("a build that already caught up offers nothing", () => {
  const feed = parseUpdateFeed(manifest());
  assert.deepEqual(decideUpdate(feed, { versionName: "0.1.0", versionCode: 12 }), {
    status: "current",
  });
  assert.deepEqual(decideUpdate(feed, { versionName: "0.0.4", versionCode: 4 }), {
    status: "current",
  });
});

test("an older build offers the release with its download size", () => {
  const decision = decideUpdate(parseUpdateFeed(manifest()), {
    versionName: "0.0.3",
    versionCode: 3,
  });
  assert.equal(decision.status, "available");
  assert.equal(decision.status === "available" && decision.size, "14.2 MiB");
  assert.equal(decision.status === "available" && decision.forced, false);
  assert.equal(decision.status === "available" && decision.manifest.versionCode, 4);
});

test("a mandatory release or one below the feed floor cannot be dismissed", () => {
  const installed = { versionName: "0.0.3", versionCode: 3 };
  const mandatory = decideUpdate(
    parseUpdateFeed(manifest({ mandatory: true })),
    installed,
  );
  assert.equal(mandatory.status === "available" && mandatory.forced, true);
  const below = decideUpdate(
    parseUpdateFeed(manifest({ minVersionCode: 4 })),
    installed,
  );
  assert.equal(below.status === "available" && below.forced, true);
  const allowed = decideUpdate(
    parseUpdateFeed(manifest({ minVersionCode: 3 })),
    installed,
  );
  assert.equal(allowed.status === "available" && allowed.forced, false);
});

test("only an optional release can be postponed", () => {
  const installed = { versionName: "0.0.3", versionCode: 3 };
  const optional = decideUpdate(parseUpdateFeed(manifest()), installed);
  const mandatory = decideUpdate(
    parseUpdateFeed(manifest({ mandatory: true })),
    installed,
  );
  const belowFloor = decideUpdate(
    parseUpdateFeed(manifest({ minVersionCode: 4 })),
    installed,
  );
  assert.equal(canDismiss(optional), true);
  assert.equal(canDismiss(mandatory), false);
  assert.equal(canDismiss(belowFloor), false);
  assert.equal(canDismiss({ status: "current" }), false);
  assert.equal(canDismiss({ status: "unknown" }), false);
});

test("the prompt is per release, and a forced one ignores dismissal", () => {
  const installed = { versionName: "0.0.3", versionCode: 3 };
  const decision = decideUpdate(parseUpdateFeed(manifest()), installed);
  const forcedDecision = decideUpdate(
    parseUpdateFeed(manifest({ mandatory: true })),
    installed,
  );
  assert.equal(shouldPrompt(decision, null), true);
  assert.equal(shouldPrompt(decision, 4), false);
  assert.equal(shouldPrompt(decision, 3), true);
  assert.equal(shouldPrompt(decision, 5), true);
  assert.equal(shouldPrompt(forcedDecision, 4), true);
  assert.equal(shouldPrompt({ status: "current" }, null), false);
  assert.equal(shouldPrompt({ status: "unknown" }, null), false);
});

test("sizes read as file sizes, not as raw byte counts", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1024), "1.0 KiB");
  assert.equal(formatBytes(1_607_120), "1.5 MiB");
  assert.equal(formatBytes(14_920_000), "14.2 MiB");
  assert.equal(formatBytes(150 * 1024 * 1024), "150 MiB");
  assert.equal(formatBytes(Number.NaN), "0 B");
});
