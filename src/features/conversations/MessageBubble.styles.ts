import { StyleSheet } from "react-native";
import { radius, space } from "../../ui/theme";

export const styles = StyleSheet.create({
  body: { fontFamily: "DMSans_400Regular", fontSize: 14 },
  tiny: { fontFamily: "DMSans_500Medium", fontSize: 11 },
  messageRow: { alignItems: "flex-start", marginTop: space.sm },
  bubble: {
    maxWidth: "83%",
    borderRadius: radius.sheet,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  bubbleMine: { borderBottomRightRadius: radius.badge },
  bubbleTheirs: { borderBottomLeftRadius: radius.badge },
  messageText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    lineHeight: 22,
  },
  messageMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    marginTop: space.xs,
    marginHorizontal: space.xs,
    marginBottom: space.xs,
  },
  chatImage: { width: 220, height: 250, borderRadius: radius.card },
  forwarded: { flexDirection: "row", alignItems: "center", gap: space.xs },
  reaction: {
    position: "absolute",
    bottom: -12,
    right: 10,
    borderRadius: radius.control,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  voice: {
    flexDirection: "row",
    gap: space.sm,
    alignItems: "center",
    paddingVertical: space.xs,
  },
  voicePlay: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  wave: { flexDirection: "row", gap: space.xs, alignItems: "center", height: 32 },
  file: { flexDirection: "row", gap: space.sm, alignItems: "center", width: 210 },
});
