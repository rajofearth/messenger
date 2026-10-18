export const coral = "#EF8E76";
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
