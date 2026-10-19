/**
 * Release rules, shared by the HTTP feed and the publish mutation.
 *
 * The file deliberately has no Convex imports: `scripts/manifest.test.mjs`
 * runs it directly, and its checks have to agree with the client's parser in
 * `src/domain/updates.ts` field by field. The server may be stricter than the
 * app, never looser, or a published release would be silently ignored.
 */

/** Mirrors `MAX_APK_BYTES` in `src/domain/updates.ts`. */
export const MAX_APK_BYTES = 200 * 1024 * 1024;
const MAX_VERSION_CODE = 2_100_000_000;
const MAX_VERSION_NAME = 32;
const MAX_URL = 2048;
const MAX_NOTES = 1000;

export type ReleaseFields = {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  apkSha256: string;
  apkBytes: number;
  /** Builds below this version code are forced to update. */
  minVersionCode: number;
  mandatory: boolean;
  notes: string;
};

/** The document the app's `parseUpdateFeed` accepts. */
export type FeedAnswer = { upToDate: true } | ReleaseFields;

function isInteger(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

/**
 * The installed version code from `?versionCode=`, or null when it is not one.
 * Zero is allowed because "0" means "show me the newest release" and is handy
 * for checking a deployment by hand; the app always sends a real version code.
 */
export function parseVersionCode(value: unknown): number | null {
  if (typeof value === "number") {
    return isInteger(value, 0, MAX_VERSION_CODE) ? value : null;
  }
  if (typeof value !== "string" || !/^\d{1,10}$/.test(value)) return null;
  const parsed = Number(value);
  return isInteger(parsed, 0, MAX_VERSION_CODE) ? parsed : null;
}

/** Only https, no credentials in the URL, and no whitespace. */
function isDownloadUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_URL || /\s/.test(value)) {
    return false;
  }
  if (!/^https:\/\//i.test(value)) return false;
  const host = value.slice("https://".length).split(/[/?#]/, 1)[0];
  return host.length > 0 && host.length <= 255 && !host.includes("@");
}

/**
 * Why a release cannot be published or served, or null when it is valid.
 * Kept as a string rather than a boolean so a failed deploy says what to fix.
 */
export function releaseProblem(
  release: ReleaseFields | null | undefined,
): string | null {
  if (!release) return "the release is missing";
  if (!isInteger(release.versionCode, 1, MAX_VERSION_CODE)) {
    return `versionCode must be an integer between 1 and ${MAX_VERSION_CODE}`;
  }
  if (
    typeof release.versionName !== "string" ||
    release.versionName.trim().length === 0 ||
    release.versionName.length > MAX_VERSION_NAME
  ) {
    return `versionName must be 1-${MAX_VERSION_NAME} characters`;
  }
  if (!isDownloadUrl(release.apkUrl)) {
    return "apkUrl must be an https URL without credentials or whitespace";
  }
  if (
    typeof release.apkSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(release.apkSha256)
  ) {
    return "apkSha256 must be 64 lowercase hex characters";
  }
  if (!isInteger(release.apkBytes, 1, MAX_APK_BYTES)) {
    return `apkBytes must be between 1 and ${MAX_APK_BYTES}`;
  }
  if (!isInteger(release.minVersionCode, 1, release.versionCode)) {
    return "minVersionCode must be between 1 and versionCode";
  }
  if (typeof release.mandatory !== "boolean") {
    return "mandatory must be a boolean";
  }
  if (typeof release.notes !== "string" || release.notes.length > MAX_NOTES) {
    return `notes must be at most ${MAX_NOTES} characters`;
  }
  return null;
}

/**
 * What the feed answers. A release is only announced to builds below it, so an
 * up-to-date app receives `{ "upToDate": true }` instead of a download URL.
 */
export function manifestFor(
  release: ReleaseFields | null,
  installedVersionCode: number,
): FeedAnswer {
  if (!release || release.versionCode <= installedVersionCode) {
    return { upToDate: true };
  }
  return {
    versionCode: release.versionCode,
    versionName: release.versionName,
    apkUrl: release.apkUrl,
    apkSha256: release.apkSha256,
    apkBytes: release.apkBytes,
    minVersionCode: release.minVersionCode,
    mandatory: release.mandatory,
    notes: release.notes,
  };
}
