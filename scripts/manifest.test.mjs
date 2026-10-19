import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_APK_BYTES,
  manifestFor,
  parseVersionCode,
  releaseProblem,
} from "../convex/lib/manifest.ts";
import { MAX_APK_BYTES as APP_MAX_APK_BYTES, parseUpdateFeed } from "../src/domain/updates.ts";

const DIGEST = "0123456789abcdef".repeat(4);

const RELEASE = {
  versionCode: 4,
  versionName: "0.0.4",
  apkUrl:
    "https://github.com/rajofearth/messenger/releases/download/v0.0.4/messenger-0.0.4-arm64-v8a.apk",
  apkSha256: DIGEST,
  apkBytes: 14_920_000,
  minVersionCode: 1,
  mandatory: false,
  notes: "Fixes the call banner.",
};

test("a valid release round-trips through the app's parser unchanged", () => {
  assert.equal(releaseProblem(RELEASE), null);
  const answer = manifestFor(RELEASE, 3);
  const parsed = parseUpdateFeed(answer);
  assert.equal(parsed?.status, "release");
  assert.deepEqual(parsed.status === "release" && parsed.manifest, RELEASE);
});

test("an up-to-date build gets the small answer, not someone else's release", () => {
  assert.deepEqual(manifestFor(null, 3), { upToDate: true });
  assert.deepEqual(manifestFor(RELEASE, 4), { upToDate: true });
  assert.deepEqual(manifestFor(RELEASE, 7), { upToDate: true });
  assert.deepEqual(parseUpdateFeed(manifestFor(RELEASE, 4)), { status: "current" });
});

test("invalid releases are caught before the app would ignore them", () => {
  const rejected = [
    { ...RELEASE, versionCode: 0 },
    { ...RELEASE, versionCode: -3 },
    { ...RELEASE, versionCode: 2_100_000_001 },
    { ...RELEASE, versionCode: 4.5 },
    { ...RELEASE, versionName: "" },
    { ...RELEASE, versionName: " " },
    { ...RELEASE, versionName: "x".repeat(33) },
    { ...RELEASE, apkUrl: "http://example.com/app.apk" },
    { ...RELEASE, apkUrl: "file:///data/local/tmp/app.apk" },
    { ...RELEASE, apkUrl: "https://user:pass@example.com/app.apk" },
    { ...RELEASE, apkUrl: "https://example.com/a b.apk" },
    { ...RELEASE, apkSha256: "A".repeat(64) },
    { ...RELEASE, apkSha256: "a".repeat(63) },
    { ...RELEASE, apkSha256: null },
    { ...RELEASE, apkBytes: 0 },
    { ...RELEASE, apkBytes: MAX_APK_BYTES + 1 },
    { ...RELEASE, minVersionCode: 0 },
    { ...RELEASE, minVersionCode: 5 },
    { ...RELEASE, mandatory: "yes" },
    { ...RELEASE, notes: "n".repeat(1001) },
    { ...RELEASE, notes: null },
  ];
  for (const value of rejected) {
    assert.notEqual(releaseProblem(value), null, JSON.stringify(value));
  }
  assert.equal(releaseProblem(null), "the release is missing");
});

test("the server and the app agree on the limits", () => {
  assert.equal(MAX_APK_BYTES, APP_MAX_APK_BYTES);
  assert.equal(releaseProblem({ ...RELEASE, apkBytes: MAX_APK_BYTES }), null);
  assert.equal(releaseProblem({ ...RELEASE, notes: "n".repeat(1000) }), null);
  assert.equal(releaseProblem({ ...RELEASE, versionName: "x".repeat(32) }), null);
  // The client accepts any scheme case, so the server must not be stricter.
  assert.equal(
    releaseProblem({ ...RELEASE, apkUrl: "HTTPS://example.com/app.apk" }),
    null,
  );
});

test("the requested version code is bounded and accepts strings", () => {
  assert.equal(parseVersionCode("4"), 4);
  assert.equal(parseVersionCode("0"), 0);
  assert.equal(parseVersionCode(7), 7);
  assert.equal(parseVersionCode(""), null);
  assert.equal(parseVersionCode("4.0"), null);
  assert.equal(parseVersionCode("-1"), null);
  assert.equal(parseVersionCode(1.5), null);
  assert.equal(parseVersionCode(2_100_000_001), null);
  assert.equal(parseVersionCode(null), null);
  assert.equal(parseVersionCode("00000000001"), null);
});
