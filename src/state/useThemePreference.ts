/**
 * The appearance slice: the stored theme preference, the device scheme, the
 * palette to draw with, and persistence.
 *
 * The preference is handed in once the repository has loaded it, so the hook
 * itself never needs to know about migration or storage ordering.
 */

import { useEffect, useRef, useState } from "react";
import { messengerRepository } from "../data/messengerRepository";
import { resolveDark } from "../ui/theme";
import type { ThemePreference } from "../ui/theme";
import { useDeviceScheme } from "./useDeviceScheme";

export function useThemePreference(stored: ThemePreference | undefined) {
  const [theme, setTheme] = useState<ThemePreference>("system");
  const scheme = useDeviceScheme();
  const applied = useRef<ThemePreference | null>(null);

  useEffect(() => {
    // A change made in Settings wins over a slow load of an older value.
    if (!stored || applied.current !== null) return;
    applied.current = stored;
    setTheme(stored);
  }, [stored]);

  function update(next: ThemePreference) {
    applied.current = next;
    setTheme(next);
    void messengerRepository.saveAppearance(next).catch(() => {});
  }

  return {
    theme,
    setTheme: update,
    dark: resolveDark(theme, scheme),
    // The device scheme on its own, for the loading screen and native chrome.
    systemDark: scheme === "dark",
  };
}
