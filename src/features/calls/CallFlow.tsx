import React from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import CallScreen from "./CallScreen";
import type { Call } from "./useCalls";
import { Avatar, IconButton } from "../../ui/primitives";
import { palette, radius, space } from "../../ui/theme";
import { formatDuration } from "../../domain/model";

const colors = palette(true);

export function CallPill({
  call,
  onOpen,
  onAnswer,
  onEnd,
}: {
  call: Call;
  onOpen: () => void;
  onAnswer: () => void;
  onEnd: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Return to call"
      onPress={onOpen}
      style={s.pill}
    >
      <View style={s.dot} />
      <View style={{ flex: 1 }}>
        <Text style={s.pillName}>{call.chat.name}</Text>
        <Text style={s.pillStatus}>
          {call.status === "active"
            ? `Call · ${formatDuration(call.seconds)}`
            : call.status === "incoming"
              ? "Incoming call"
              : "Calling…"}
        </Text>
      </View>
      {call.status === "incoming" && (
        <IconButton
          name="call"
            background={colors.success}
          color="white"
          label="Answer call"
          onPress={onAnswer}
        />
      )}
      <IconButton
        name="call"
        hangup
         background={colors.danger}
        color="white"
        label={call.status === "incoming" ? "Decline call" : "End call"}
        onPress={onEnd}
      />
    </Pressable>
  );
}
export default function CallFlow({
  call,
  onBack,
  onEnd,
  onAnswer,
  onChat,
  onMuteChange,
  onSpeakerChange,
}: {
  call: Call;
  onBack: () => void;
  onEnd: () => void;
  onAnswer: () => void;
  onChat: () => void;
  onMuteChange: (value: boolean) => void;
  onSpeakerChange: (value: boolean) => void;
}) {
  if (call.status === "active")
    return (
      <CallScreen
        name={call.chat.name}
        avatar={call.chat.avatar}
        video={call.video}
        seconds={call.seconds}
        muted={call.muted}
        speaker={call.speaker}
        onMuteChange={onMuteChange}
        onSpeakerChange={onSpeakerChange}
        onBack={onBack}
        onEnd={onEnd}
        onChat={onChat}
      />
    );
  return (
    <View style={s.ringing}>
      <IconButton
        name="chevron-back"
        color="white"
        label="Back to app"
        onPress={onBack}
      />
      <View style={s.center}>
        <Avatar uri={call.chat.avatar} name={call.chat.name} size={124} />
        <Text style={s.name}>{call.chat.name}</Text>
        <Text style={s.status}>
          {call.status === "incoming" ? "Incoming" : "Calling"}{" "}
          {call.video ? "video" : "voice"} call
          {call.status === "calling" ? "…" : ""}
        </Text>
        <Text style={s.demo}>Demo call</Text>
      </View>
      <View style={s.actions}>
        <View style={s.action}>
          <IconButton
            name="call"
            hangup
            background={colors.danger}
            color="white"
            size={30}
            label={call.status === "incoming" ? "Decline call" : "Cancel call"}
            onPress={onEnd}
          />
          <Text style={s.caption}>
            {call.status === "incoming" ? "Decline" : "Cancel"}
          </Text>
        </View>
        {call.status === "incoming" && (
          <View style={s.action}>
            <IconButton
              name="call"
              background={colors.success}
              color="white"
              size={30}
              label="Answer call"
              onPress={onAnswer}
            />
            <Text style={s.caption}>Answer</Text>
          </View>
        )}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  pill: {
    marginHorizontal: space.lg,
    marginTop: space.sm,
    marginBottom: space.xs,
    backgroundColor: "#222222",
    borderRadius: radius.card,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.sm,
    paddingLeft: space.lg,
  },
  dot: { width: 8, height: 8, backgroundColor: colors.success, borderRadius: 4 },
  pillName: { fontWeight: "600", color: colors.fg, fontSize: 12 },
  pillStatus: {
    color: "#BDBDBD",
    fontSize: 10,
    marginTop: space.xs,
  },
  ringing: { flex: 1, paddingTop: 48, paddingHorizontal: space.xl, backgroundColor: "#111111" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 48,
  },
  name: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 30,
    marginTop: space.xl,
  },
  status: { color: "#BDBDBD", marginTop: space.sm },
  demo: {
    color: "#BDBDBD",
    fontSize: 11,
    marginTop: space.xl,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 88,
    paddingBottom: 64,
  },
  action: { alignItems: "center", gap: space.md },
  caption: {
    color: "#FFFFFFC0",
    fontSize: 11,
  },
});
