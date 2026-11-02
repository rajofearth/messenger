import { StyleSheet } from "react-native";
import { radius, space } from "../../ui/theme";

export const styles = StyleSheet.create({
  root: { flex: 1 },
  tiny: { fontFamily: "DMSans_500Medium", fontSize: 11 },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 12,
    paddingLeft: space.xs,
    paddingVertical: space.md,
    borderBottomWidth: 1,
  },
  contact: { flex: 1, marginLeft: space.md },
  name: { fontFamily: "DMSans_500Medium", fontSize: 16 },
  messageList: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.lg },
  dateChip: { alignItems: "center", marginBottom: space.lg, marginTop: space.xs },
  emptyThread: {
    textAlign: "center",
    paddingHorizontal: 28,
    paddingVertical: 48,
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    lineHeight: 22,
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    marginHorizontal: space.lg,
    marginTop: space.sm,
    marginBottom: space.lg,
    padding: space.xs,
    borderRadius: radius.pill,
    minHeight: 56,
  },
  messageInput: {
    flex: 1,
    maxHeight: 110,
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
  },
  blockedText: {
    flex: 1,
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: space.sm,
  },
  liveDot: { width: 8, height: 8, borderRadius: radius.pill },
  imageViewer: {
    flex: 1,
    justifyContent: "center",
  },
  imageClose: { position: "absolute", right: 16, top: 54, zIndex: 2 },
});
