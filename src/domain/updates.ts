/**
 * Release-feed rules: what a published manifest may say, and whether the
 * running app should offer it.
 *
 * The feed is untrusted input, so everything is validated here and the UI only
 * ever sees a parsed manifest. `versionCode` - never the version name - is the
 * ordering key, because it is what Android itself compares when installing one
 * build over another.
 */

/** Mirrors the native download cap in `modules/app-updater`. */
export const MAX_APK_BYTES = 200 * 1024 * 1024;

/** Android's own ceiling for a single version code. */
const MAX_VERSION_CODE = 2_100_000_000;

export type UpdateManifest = {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  apkSha256: string;
  apkBytes: number;
  /** Builds below this version are forced to update. */
  minVersionCode: number;
  mandatory: boolean;
  notes: string;
};

export type UpdateFeed =
  /** The feed has nothing newer than the build that asked. */
  | { status: "current" }
  | { status: "release"; manifest: UpdateManifest };

export type InstalledApp = {
  versionName: string;
  versionCode: number;
};

export type UpdateDecision =
  /** The feed could not be read, so nothing is offered. */
  | { status: "unknown" }
  | { status: "current" }
  | {
      status: "available";
      manifest: UpdateManifest;
      /** The prompt cannot be dismissed away: a mandatory or too-old build. */
      forced: boolean;
      size: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Integers arrive as numbers, but hand-written feeds quote them. */
function toInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d{1,10}$/.test(value)) return Number(value);
  return null;
}

/**
 * Only https, no credentials in the URL, and no whitespace. The download is
 * additionally checked natively, so a feed cannot smuggle another scheme.
 */
function isDownloadUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || /\s/.test(value)) {
    return false;
  }
  if (!/^https:\/\//i.test(value)) return false;
  const host = value.slice("https://".length).split(/[/?#]/, 1)[0];
  return host.length > 0 && host.length <= 255 && !host.includes("@");
}

function boundedText(value: unknown, max: number): string | null {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > max) return null;
  return value;
}

export function parseUpdateManifest(value: unknown): UpdateManifest | null {
  if (!isRecord(value)) return null;
  const versionCode = toInteger(value.versionCode);
  if (versionCode === null || versionCode < 1 || versionCode > MAX_VERSION_CODE) {
    return null;
  }
  const versionName = boundedText(value.versionName, 32);
  if (!versionName) return null;
  if (!isDownloadUrl(value.apkUrl)) return null;
  if (typeof value.apkSha256 !== "string" || !/^[0-9a-f]{64}$/i.test(value.apkSha256)) {
    return null;
  }
  const apkBytes = toInteger(value.apkBytes);
  if (apkBytes === null || apkBytes < 1 || apkBytes > MAX_APK_BYTES) return null;
  const minVersionCode =
    value.minVersionCode === undefined ? versionCode : toInteger(value.minVersionCode);
  if (minVersionCode === null || minVersionCode < 1 || minVersionCode > versionCode) {
    return null;
  }
  if (value.mandatory !== undefined && typeof value.mandatory !== "boolean") return null;
  const notes = boundedText(value.notes, 1000);
  if (notes === null) return null;
  return {
    versionCode,
    versionName,
    apkUrl: value.apkUrl,
    apkSha256: value.apkSha256.toLowerCase(),
    apkBytes,
    minVersionCode,
    mandatory: value.mandatory === true,
    notes,
  };
}

/**
 * A release feed answers either `{ upToDate: true }` or a manifest. Anything
 * else - an HTML error page, a truncated body, a proxy banner - reads as
 * unreadable, which is never an update.
 */
export function parseUpdateFeed(value: unknown): UpdateFeed | null {
  if (!isRecord(value)) return null;
  if (value.upToDate === true) return { status: "current" };
  const manifest = parseUpdateManifest(value);
  return manifest ? { status: "release", manifest } : null;
}

export function decideUpdate(
  feed: UpdateFeed | null,
  installed: InstalledApp,
): UpdateDecision {
  if (!feed) return { status: "unknown" };
  if (feed.status === "current") return { status: "current" };
  const { manifest } = feed;
  if (installed.versionCode >= manifest.versionCode) return { status: "current" };
  return {
    status: "available",
    manifest,
    forced: manifest.mandatory || installed.versionCode < manifest.minVersionCode,
    size: formatBytes(manifest.apkBytes),
  };
}

/** One decimal for ordinary sizes, none once the number is three digits. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(decimals)} ${units[unit]}`;
}

/**
 * The launch prompt appears once per release. A forced update keeps asking,
 * and a newer release always asks again, because dismissal is remembered per
 * version code rather than forever.
 */
export function shouldPrompt(
  decision: UpdateDecision,
  dismissedVersionCode: number | null,
): boolean {
  if (decision.status !== "available") return false;
  return decision.forced || dismissedVersionCode !== decision.manifest.versionCode;
}
