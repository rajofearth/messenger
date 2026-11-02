import { StyleSheet } from "react-native";
import { palette, radius, space } from "../../ui/theme";

/**
 * The settings branch used to carry its own warm palette, which drifted from
 * the rest of the app. It now reads every shared token, and keeps only the
 * segmented-control well that has no palette equivalent.
 */
export function settingsColors(dark: boolean) {
  const colors = palette(dark);
  return {
    ...colors,
    text: colors.fg,
  };
}

export type SettingsColors = ReturnType<typeof settingsColors>;

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.xxl,
    paddingTop: space.lg,
    paddingBottom: space.xxl,
    gap: space.md,
  },

  headerTitle: {
    flex: 1,
    fontFamily: "DMSans_500Medium",
    fontSize: 20,
  },

  content: { paddingHorizontal: space.xxl, paddingBottom: space.xxxl },

  profile: {
    borderRadius: radius.sheet,
    alignItems: "center",
    padding: space.xxl,
  },
  avatarWrap: { marginBottom: space.lg },
  avatar: { width: 88, height: 88, borderRadius: radius.sheet },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  camera: {
    position: "absolute",
    right: -space.xs,
    bottom: -space.xs,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: space.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    fontFamily: "DMSans_500Medium",
    fontSize: 22,
    textAlign: "center",
  },
  bio: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    lineHeight: 20,
    marginTop: space.xs,
    textAlign: "center",
  },
  edit: {
    marginTop: space.lg,
    flexDirection: "row",
    gap: space.xs,
    alignItems: "center",
    paddingHorizontal: space.lg,
    minHeight: 44,
    borderRadius: radius.pill,
  },
  editText: { fontFamily: "DMSans_500Medium", fontSize: 12 },
  loader: { marginTop: space.md },
  section: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    marginTop: space.xl,
    marginBottom: space.md,
    marginLeft: space.xs,
  },
  card: { borderRadius: radius.card, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.lg,
    gap: space.md,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.control,
    justifyContent: "center",
    alignItems: "center",
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: "DMSans_500Medium", fontSize: 14 },
  rowSubtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    lineHeight: 17,
    marginTop: space.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
    marginRight: space.lg,
  },
  segment: {
    flexDirection: "row",
    gap: space.xs,
    marginHorizontal: space.md,
    marginTop: -space.xs,
    marginBottom: space.lg,
    padding: space.xs,
    borderRadius: radius.card,
  },
  segmentOption: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: {},
  segmentText: { fontFamily: "DMSans_500Medium", fontSize: 13 },
  note: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    lineHeight: 17,
    marginHorizontal: space.xs,
    marginTop: space.sm,
  },
  call: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.md,
    marginTop: space.xxl,
  },
  callIcon: {
    backgroundColor: "transparent",
    width: 48,
    height: 48,
    borderRadius: radius.control,
    justifyContent: "center",
    alignItems: "center",
  },

  overlay: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "center",
    paddingHorizontal: space.xxl,
    paddingVertical: space.xxxl,
  },
  modal: {
    borderRadius: radius.sheet,
    padding: space.xxl,
    maxHeight: "100%",
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginBottom: space.lg,
  },
  modalTitle: {
    flex: 1,
    fontFamily: "DMSans_500Medium",
    fontSize: 20,
  },
  modalContent: { paddingBottom: 2 },
  modalBody: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    lineHeight: 23,
    marginBottom: space.lg,
  },
  modalSymbol: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xl,
  },
  label: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    marginBottom: 9,
    marginTop: 5,
  },
  input: {
    borderRadius: radius.control,
    padding: space.md,
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    marginBottom: space.lg,
  },
  bioInput: {
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: space.xs,
  },
  counter: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    textAlign: "right",
    marginBottom: space.xl,
  },
  primary: {
    backgroundColor: "transparent",
    borderRadius: radius.control,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.xs,
  },
  primaryText: { fontFamily: "DMSans_500Medium", fontSize: 14 },
  secondary: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: "transparent",
    minHeight: 46,
  },
  secondaryText: { fontFamily: "DMSans_500Medium", fontSize: 13 },
});
