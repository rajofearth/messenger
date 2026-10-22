export const coral = "#EF8E76";

/**
 * Copy and icons that sit on a coral surface. The coral is the same shade in
 * both palettes, so this dark ink is measured once: 6.7:1 against #EF8E76.
 * White would land near 2.3:1 and fails normal-size text.
 */
export const onCoral = "#3A1710";

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
    muted: dark ? "#BDB1A3" : "#66706A",
    card: dark ? "#36312B" : "#FFFFFF",
    line: dark ? "#4A4239" : "#EEEDE7",
    tint: dark ? "#543D32" : "#FBECE5",
    // Dark text keeps normal-size outgoing copy above 4.5:1 on the coral
    // bubbles in both themes; the muted variant is for secondary labels.
    outgoingFg: dark ? "#120805" : "#3A1710",
    outgoingMuted: dark ? "#24100C" : "#54251A",
    /** Dark copy for coral buttons, unread badges and the story plus. */
    onCoral,
    /**
     * Accent copy and icons on app or card surfaces. `coral` is a fill colour
     * and is too light for normal-size text on white; this darker ink keeps the
     * same hue while clearing 4.5:1 in the light theme.
     */
    coralInk: dark ? coral : "#9A3D2A",
  };
}
export type Colors = ReturnType<typeof palette>;
