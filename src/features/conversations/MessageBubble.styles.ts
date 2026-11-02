import { StyleSheet } from "react-native";
import { radius, space } from "../../ui/theme";

export const styles = StyleSheet.create({
  body: { fontFamily: "sans-serif", fontSize: 14 },
  tiny: { fontFamily: "sans-serif-medium", fontSize: 11 },
  messageRow: { alignItems: "flex-start", marginTop: space.xs },
  bubble: {
    maxWidth: "83%",
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  bubbleMine: { borderBottomRightRadius: radius.badge },
  bubbleTheirs: { borderBottomLeftRadius: radius.badge },
  messageText: {
    fontFamily: "sans-serif",
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
  chatImage: { width: 220, height: 250, borderRadius: radius.control },
  videoPreview: { width: 220, height: 180, borderRadius: radius.control, overflow: "hidden" },
  videoShade: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaCaption: { marginTop: space.sm, fontFamily: "sans-serif", fontSize: 14, lineHeight: 20 },
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
