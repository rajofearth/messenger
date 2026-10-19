export const coral = "#EF8E76";

/** How the app chooses its palette: follow the device, or pin one theme. */
export type ThemePreference = "system" | "light" | "dark";

/** The device scheme as React Native reports it, including "unspecified". */
export type DeviceScheme = "light" | "dark" | "unspecified" | null | undefined;

/** The palette to draw with, combining the stored preference and the device. */
export function resolveDark(
  theme: ThemePreference,
  scheme: DeviceScheme,
): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return scheme === "dark";
}

/** A scheme as native code reports it; anything else means "unknown". */
export function parseDeviceScheme(value: unknown): "light" | "dark" | null {
  return value === "dark" || value === "light" ? value : null;
}

export function palette(dark: boolean) {
  return {
    bg: dark ? "#292622" : "#FBFAF7",
    fg: dark ? "#FAF3E8" : "#28332E",
    muted: dark ? "#BDB1A3" : "#92978F",
    card: dark ? "#36312B" : "#FFFFFF",
    line: dark ? "#4A4239" : "#EEEDE7",
    tint: dark ? "#543D32" : "#FBECE5",
  };
}
export type Colors = ReturnType<typeof palette>;
