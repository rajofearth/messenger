/**
 * Normalizes the persisted appearance slice, so the rest of the app only ever
 * sees the current `{ theme }` shape.
 *
 * Records written before the theme control gained its "system" option stored
 * `{ dark: boolean }`. They keep their pinned theme instead of suddenly
 * following the device.
 */

import type { AppearanceRecord, LegacyAppearanceRecord } from "./records";

export function normalizeAppearance(
  record: AppearanceRecord | LegacyAppearanceRecord | null | undefined,
): AppearanceRecord | undefined {
  if (typeof record !== "object" || record === null) return undefined;
  if ("theme" in record) {
    const { theme } = record;
    return theme === "system" || theme === "light" || theme === "dark"
      ? { theme }
      : undefined;
  }
  if ("dark" in record && typeof record.dark === "boolean") {
    return { theme: record.dark ? "dark" : "light" };
  }
  return undefined;
}
