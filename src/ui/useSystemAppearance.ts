/**
 * Keeps native surfaces in step with the in-app theme.
 *
 * `Appearance.setColorScheme` sets the AppCompat night mode that native UI -
 * dialogs, selection handles, keyboard contrast - follows. The "system" theme
 * resolves to the device's current scheme instead of `"unspecified"`: AppCompat
 * ignores a repeat of the mode it already has, so asking it to follow the
 * system again after a device switch does nothing, while a light or dark value
 * is a change it applies at once.
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
  deviceDark: boolean,
) {
  useEffect(() => {
    if (Platform.OS === "web") return;
    Appearance.setColorScheme(
      theme === "system" ? (deviceDark ? "dark" : "light") : theme,
    );
    void SystemUI.setBackgroundColorAsync(background).catch(() => {});
  }, [theme, background, deviceDark]);
}
