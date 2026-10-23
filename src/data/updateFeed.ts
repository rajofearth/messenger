/**
 * The release feed: one small JSON document that says whether a newer build
 * exists and where to get it.
 *
 * Only the endpoint is configured; everything about the document is validated
 * in `src/domain/updates.ts`. The URL is baked into the bundle at build time:
 * production uses `EXPO_PUBLIC_UPDATE_FEED_URL`; a development build uses
 * `EXPO_PUBLIC_DEV_UPDATE_FEED_URL` so the two channels can never cross. A
 * build without a feed simply has no update check instead of pointing at a
 * placeholder server.
 *
 * The installed version code goes in the query string, so a current app gets a
 * 20-byte `{"upToDate":true}` instead of someone else's download URL.
 *
 * Failing to read the feed is reported as `failed`, never as "up to date":
 * the two look the same to the user otherwise, and only one of them is honest.
 */

import { parseUpdateFeed, type UpdateFeed } from "../domain/updates";

export type FeedCheck = UpdateFeed | { status: "failed" };

const TIMEOUT_MS = 10_000;
/** A feed document is a few hundred bytes; anything larger is not one. */
const MAX_BYTES = 256 * 1024;

function feedUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !/^https:\/\//i.test(trimmed)) return null;
  return trimmed;
}

const configuredFeedUrl =
  process.env.EXPO_PUBLIC_APP_VARIANT === "dev"
    ? process.env.EXPO_PUBLIC_DEV_UPDATE_FEED_URL
    : process.env.EXPO_PUBLIC_UPDATE_FEED_URL;

export const updateFeedUrl = feedUrl(configuredFeedUrl);
export const isUpdateFeedConfigured = updateFeedUrl !== null;

export async function fetchUpdateFeed(installedVersionCode: number): Promise<FeedCheck> {
  if (!updateFeedUrl) return { status: "failed" };
  // A plain concatenation keeps this working on every URL polyfill; the value
  // is an integer that came from Android's package manager.
  const separator = updateFeedUrl.includes("?") ? "&" : "?";
  const url = `${updateFeedUrl}${separator}versionCode=${installedVersionCode}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) return { status: "failed" };
    const body = await response.text();
    if (body.length > MAX_BYTES) return { status: "failed" };
    return parseUpdateFeed(JSON.parse(body)) ?? { status: "failed" };
  } catch {
    // Offline, timed out, or not JSON. The caller decides what to say.
    return { status: "failed" };
  } finally {
    clearTimeout(timeout);
  }
}
