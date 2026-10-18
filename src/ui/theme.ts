export const coral = "#EF8E76";
export function palette(dark: boolean) {
  return {
    bg: dark ? "#191D1B" : "#FBFAF7",
    fg: dark ? "#F3F0EB" : "#28332E",
    muted: dark ? "#A4ABA6" : "#92978F",
    card: dark ? "#252B27" : "#FFFFFF",
    line: dark ? "#333A34" : "#EEEDE7",
    tint: dark ? "#44332C" : "#FBECE5",
  };
}
export type Colors = ReturnType<typeof palette>;
