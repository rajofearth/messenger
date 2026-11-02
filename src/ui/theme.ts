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

/**
 * The spacing steps. Every margin, padding, gap and fixed row size comes from
 * here or from a multiple of four of it, so screens keep one rhythm.
 */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/**
 * Corner radii by role. An inner corner equals the outer radius minus the
 * padding between them, never below 4. Pills use `pill` and nothing else does.
 */
export const radius = {
  badge: 6,
  control: 10,
  card: 14,
  sheet: 20,
  pill: 999,
} as const;

/**
 * Type roles in DM Sans. 400 for reading, 500 for names and headings, 600 only
 * for counts and tiny emphasis. Hierarchy comes from size and colour, not
 * weight, and tracking stays at zero.
 */
export const typeScale = {
  display: { fontFamily: "DMSans_500Medium", fontSize: 28, lineHeight: 34 },
  title: { fontFamily: "DMSans_500Medium", fontSize: 20, lineHeight: 26 },
  body: { fontFamily: "DMSans_400Regular", fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: "DMSans_500Medium", fontSize: 15, lineHeight: 20 },
  label: { fontFamily: "DMSans_500Medium", fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: "DMSans_400Regular", fontSize: 12, lineHeight: 16 },
} as const;

/** Cells for figures that change, so digits keep one width. */
export const tabularNums = { fontVariant: ["tabular-nums" as const] };

export function palette(dark: boolean) {
  return {
    bg: dark ? "#191715" : "#FFFFFF",
    fg: dark ? "#F4EDE4" : "#111111",
    muted: dark ? "#B7AC9F" : "#6B6B6B",
    card: dark ? "#221F1C" : "#FFFFFF",
    line: dark ? "#332E29" : "#E8E8E8",
    /** A wash of the coral, for the selected tab and pressed states. */
    tint: dark ? "#322720" : "#F4F4F4",
    /** Search fields, segmented tracks and other wells that sit on `card`. */
    input: dark ? "#26221F" : "#F4F4F4",
    /** A raised row or the selected segment of a control. */
    selected: dark ? "#2C2824" : "#EEEEEE",
    /** The plate behind photos and video, so they read as media not chrome. */
    media: dark ? "#121110" : "#23201E",
    /** A flat overlay for photos and modals. No gradient needed. */
    scrim: dark ? "rgba(8,6,5,0.62)" : "rgba(20,16,13,0.55)",
    /** Copy and icons that sit directly on a photo or a dark scrim. */
    onImage: "#FFF8F2",
    /** A neutral shadow; opacity stays on the element that casts it. */
    shadow: dark ? "#000000" : "#2B2723",
    danger: dark ? "#F0A79E" : "#A3231B",
    dangerSoft: dark ? "#3A2523" : "#FAE9E6",
    success: dark ? "#8FD0AC" : "#2C6A4A",
    successSoft: dark ? "#223028" : "#E7F2EC",
    /** Blue marks a conversation that needs attention. */
    unread: dark ? "#56B4F8" : "#1398E8",
    /** Green is reserved for live presence indicators. */
    online: dark ? "#55C878" : "#2EAD59",
    switchTrackOff: dark ? "#4A423A" : "#D9D3CA",
    switchTrackOn: coral,
    switchThumb: dark ? "#F4EDE4" : "#FFFFFF",
    /** The coral message bubble and its two ink roles. */
    outgoingBg: dark ? "#B86B57" : "#F4A18B",
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
