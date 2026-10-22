import { StyleSheet } from "react-native";
import { coral, onCoral, palette } from "../../ui/theme";

/**
 * The settings branch used to carry its own warm palette, which drifted from
 * the rest of the app. It now reads every shared token, and keeps only the
 * segmented-control well that has no palette equivalent.
 */
export function settingsColors(dark: boolean) {
  const colors = palette(dark);
  return {
    bg: colors.bg,
    card: colors.card,
    text: colors.fg,
    muted: colors.muted,
    line: colors.line,
    tint: colors.tint,
    onCoral: colors.onCoral,
    coralInk: colors.coralInk,
    // Light enough that the shared muted ink stays above 4.5:1 on it.
    input: dark ? "#302B25" : "#F2F1EC",
  };
}

export type SettingsColors = ReturnType<typeof settingsColors>;

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 22,
    gap: 14,
  },

  headerTitle: {
    flex: 1,
    fontFamily: "DMSans_700Bold",
    fontSize: 22,
    letterSpacing: -0.6,
  },

  content: { paddingHorizontal: 24, paddingBottom: 36 },

  profile: { borderRadius: 28, alignItems: "center", padding: 25 },
  avatarWrap: { marginBottom: 16 },
  avatar: { width: 88, height: 88, borderRadius: 32 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  camera: {
    position: "absolute",
    right: -7,
    bottom: -3,
    width: 31,
    height: 31,
    borderRadius: 16,
    backgroundColor: coral,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    fontFamily: "DMSans_700Bold",
    fontSize: 23,
    letterSpacing: -0.6,
    textAlign: "center",
  },
  bio: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 5,
    textAlign: "center",
  },
  edit: {
    marginTop: 18,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    paddingHorizontal: 17,
    minHeight: 44,
    borderRadius: 22,
  },
  editText: { fontFamily: "DMSans_700Bold", fontSize: 12 },
  loader: { marginTop: 12 },
  section: {
    fontFamily: "DMSans_700Bold",
    fontSize: 10,
    letterSpacing: 1.8,
    marginTop: 27,
    marginBottom: 12,
    marginLeft: 4,
  },
  card: { borderRadius: 22, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 18,
    gap: 12,
  },
  rowIcon: {
    width: 39,
    height: 39,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: "DMSans_500Medium", fontSize: 14 },
  rowSubtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 66,
    marginRight: 17,
  },
  segment: {
    flexDirection: "row",
    gap: 4,
    marginHorizontal: 15,
    marginTop: -4,
    marginBottom: 16,
    padding: 4,
    borderRadius: 16,
  },
  segmentOption: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: { backgroundColor: coral },
  segmentText: { fontFamily: "DMSans_500Medium", fontSize: 13 },
  note: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    lineHeight: 17,
    marginHorizontal: 5,
    marginTop: 10,
  },
  call: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    padding: 18,
    gap: 13,
    marginTop: 24,
  },
  callIcon: {
    backgroundColor: coral,
    width: 46,
    height: 46,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(16,25,20,0.5)",
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 40,
  },
  modal: {
    borderRadius: 28,
    padding: 24,
    maxHeight: "100%",
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 17,
  },
  modalTitle: {
    flex: 1,
    fontFamily: "DMSans_700Bold",
    fontSize: 21,
    letterSpacing: -0.6,
  },
  modalContent: { paddingBottom: 2 },
  modalBody: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    lineHeight: 23,
    marginBottom: 17,
  },
  modalSymbol: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  label: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    marginBottom: 9,
    marginTop: 5,
  },
  input: {
    borderRadius: 14,
    padding: 14,
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    marginBottom: 17,
  },
  bioInput: { minHeight: 100, textAlignVertical: "top", marginBottom: 6 },
  counter: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    textAlign: "right",
    marginBottom: 20,
  },
  primary: {
    backgroundColor: coral,
    borderRadius: 16,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 3,
  },
  primaryText: { fontFamily: "DMSans_700Bold", color: onCoral, fontSize: 14 },
  secondary: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: coral,
    minHeight: 46,
  },
  secondaryText: { fontFamily: "DMSans_500Medium", fontSize: 13 },
});
