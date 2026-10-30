/**
 * Normalizes the persisted appearance slice, so the rest of the app only ever
 * sees the current `{ theme }` shape. The stored value is untrusted input.
 */

import type { ThemePreference } from "../ui/theme";
import type { AppearanceRecord } from "./records";

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function normalizeAppearance(
  record: unknown,
): AppearanceRecord | undefined {
  if (typeof record !== "object" || record === null) return undefined;
  const theme = "theme" in record ? record.theme : undefined;
  return isThemePreference(theme) ? { theme } : undefined;
}
