import React from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import CallScreen from "./CallScreen";
import type { Call } from "./useCalls";
import { Avatar, IconButton } from "../../ui/primitives";
import { formatDuration } from "../../domain/model";

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
            ? `Ongoing call · ${formatDuration(call.seconds)}`
            : call.status === "incoming"
              ? "Incoming call"
              : "Calling…"}
        </Text>
      </View>
      {call.status === "incoming" && (
        <IconButton
          name="call"
          background="#69A584"
          color="white"
          label="Answer call"
          onPress={onAnswer}
        />
      )}
      <IconButton
        name="call"
        hangup
        background="#E66C66"
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
}: {
  call: Call;
  onBack: () => void;
  onEnd: () => void;
  onAnswer: () => void;
  onChat: () => void;
}) {
  if (call.status === "active")
    return (
      <CallScreen
        name={call.chat.name}
        avatar={call.chat.avatar}
        video={call.video}
        seconds={call.seconds}
        onBack={onBack}
        onEnd={onEnd}
        onChat={onChat}
      />
    );
  return (
    <LinearGradient colors={["#303E36", "#18241F"]} style={s.ringing}>
      <IconButton
        name="chevron-back"
        color="white"
        label="Back to app"
        onPress={onBack}
      />
      <View style={s.center}>
        <Avatar uri={call.chat.avatar} size={124} />
        <Text style={s.name}>{call.chat.name}</Text>
        <Text style={s.status}>
          {call.status === "incoming" ? "Incoming" : "Calling"}{" "}
          {call.video ? "video" : "voice"} call
          {call.status === "calling" ? "…" : ""}
        </Text>
        <Text style={s.demo}>Simulated call</Text>
      </View>
      <View style={s.actions}>
        <View style={s.action}>
          <IconButton
            name="call"
            hangup
            background="#F06464"
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
              background="#69A584"
              color="white"
              size={30}
              label="Answer call"
              onPress={onAnswer}
            />
            <Text style={s.caption}>Answer</Text>
          </View>
        )}
      </View>
    </LinearGradient>
  );
}
const s = StyleSheet.create({
  pill: {
    marginHorizontal: 15,
    marginTop: 7,
    marginBottom: 4,
    backgroundColor: "#34493D",
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    paddingLeft: 16,
  },
  dot: { width: 7, height: 7, backgroundColor: "#94D6A0", borderRadius: 5 },
  pillName: { fontFamily: "DMSans_700Bold", color: "#FFF", fontSize: 12 },
  pillStatus: {
    fontFamily: "DMSans_400Regular",
    color: "#D6E2D9",
    fontSize: 10,
    marginTop: 3,
  },
  ringing: { flex: 1, paddingTop: 50, paddingHorizontal: 22 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 45,
  },
  name: {
    color: "#FFF",
    fontFamily: "DMSans_700Bold",
    fontSize: 31,
    marginTop: 25,
  },
  status: { color: "#C1D0C4", fontFamily: "DMSans_400Regular", marginTop: 11 },
  demo: {
    color: "#FFFFFF77",
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    marginTop: 20,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 90,
    paddingBottom: 65,
  },
  action: { alignItems: "center", gap: 12 },
  caption: {
    color: "#FFFFFFC0",
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
  },
});
