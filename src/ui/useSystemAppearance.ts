/**
 * Keeps native surfaces in step with the in-app theme.
 *
 * `Appearance.setColorScheme` makes native UI - dialogs, selection handles,
 * keyboard contrast - follow the theme picked in Settings instead of the
 * device scheme; "unspecified" hands control back to the device.
 *
 * `SystemUI.setBackgroundColorAsync` paints the root view behind the app and
 * remembers the color for the next launch, so startup and transitions never
 * flash a color the theme does not use.
 */

import { useEffect } from "react";
import { Appearance, Platform } from "react-native";
import * as SystemUI from "expo-system-ui";
import type { ThemePreference } from "./theme";

export function useSystemAppearance(
  theme: ThemePreference,
  background: string,
) {
  useEffect(() => {
    if (Platform.OS === "web") return;
    Appearance.setColorScheme(theme === "system" ? "unspecified" : theme);
    void SystemUI.setBackgroundColorAsync(background).catch(() => {});
  }, [theme, background]);
}
