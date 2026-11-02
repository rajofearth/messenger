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
    bg: dark ? "#111111" : "#FFFFFF",
    fg: dark ? "#F5F5F5" : "#111111",
    muted: dark ? "#A6A6A6" : "#6B6B6B",
    card: dark ? "#171717" : "#FFFFFF",
    line: dark ? "#2A2A2A" : "#E8E8E8",
    tint: dark ? "#242424" : "#F4F4F4",
    input: dark ? "#202020" : "#F4F4F4",
    selected: dark ? "#2A2A2A" : "#EEEEEE",
    media: "#111111",
    scrim: dark ? "rgba(0,0,0,0.72)" : "rgba(0,0,0,0.45)",
    onImage: "#FFFFFF",
    shadow: "#000000",
    switchTrackOff: dark ? "#4A4A4A" : "#D6D6D6",
    switchTrackOn: dark ? "#F5F5F5" : "#111111",
    switchThumb: dark ? "#111111" : "#FFFFFF",
    onCoral: dark ? "#111111" : "#FFFFFF",
    coralInk: dark ? "#F5F5F5" : "#111111",
    text: dark ? "#F5F5F5" : "#111111",
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
    fontSize: 20,
    fontWeight: "600",
  },

  content: { paddingHorizontal: space.xxl, paddingBottom: space.xxxl },

  profile: {
    borderRadius: 0,
    alignItems: "center",
    padding: space.xxl,
  },
  avatarWrap: { marginBottom: space.lg },
  avatar: { width: 88, height: 88, borderRadius: 44 },
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
    fontSize: 22,
    fontWeight: "600",
    textAlign: "center",
  },
  bio: {
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
    borderRadius: radius.control,
  },
  editText: { fontSize: 12, fontWeight: "600" },
  loader: { marginTop: space.md },
  section: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: space.xl,
    marginBottom: space.md,
    marginLeft: space.xs,
  },
  card: { borderRadius: 0, overflow: "hidden" },
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
  rowTitle: { fontSize: 14, fontWeight: "600" },
  rowSubtitle: {
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
    borderRadius: radius.control,
  },
  segmentOption: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: {},
  segmentText: { fontSize: 13, fontWeight: "600" },
  note: {
    fontSize: 11,
    lineHeight: 17,
    marginHorizontal: space.xs,
    marginTop: space.sm,
  },
  call: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 0,
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
    borderRadius: radius.control,
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
    fontSize: 20,
    fontWeight: "600",
  },
  modalContent: { paddingBottom: 2 },
  modalBody: {
    fontSize: 14,
    lineHeight: 23,
    marginBottom: space.lg,
  },
  modalSymbol: {
    width: 62,
    height: 62,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xl,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 9,
    marginTop: 5,
  },
  input: {
    borderRadius: radius.control,
    padding: space.md,
    fontSize: 15,
    marginBottom: space.lg,
  },
  bioInput: {
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: space.xs,
  },
  counter: {
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
  primaryText: { fontSize: 14, fontWeight: "600" },
  secondary: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: "transparent",
    minHeight: 46,
  },
  secondaryText: { fontSize: 13, fontWeight: "600" },
});
