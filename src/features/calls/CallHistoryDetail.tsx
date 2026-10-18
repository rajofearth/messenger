import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Chat } from "../../domain/data";
import type { CallRecord } from "../../state/useMessenger";
import { formatDuration } from "../../domain/model";
import { Avatar, IconButton } from "../../ui/primitives";
import { coral, palette } from "../../ui/theme";

export type CallHistoryDetailProps = {
  chat: Chat;
  history: CallRecord[];
  dark: boolean;
  onBack: () => void;
  onProfile: () => void;
  onCall: (video: boolean) => void;
};

export function CallHistoryList({
  chat,
  history,
  dark,
  onCall,
}: Pick<CallHistoryDetailProps, "chat" | "history" | "dark" | "onCall">) {
  const colors = palette(dark);
  const records = history.filter((record) => record.chat.id === chat.id);
  return (
    <View>
      {!records.length && (
        <Text style={[s.empty, { color: colors.muted }]}>
          No calls with {chat.name} yet.
        </Text>
      )}
      {records.map((record) => (
        <View
          key={record.id}
          style={[s.row, { borderBottomColor: colors.line }]}
        >
          <Ionicons
            name={
              record.missed
                ? "arrow-down"
                : record.video
                  ? "videocam-outline"
                  : "call-outline"
            }
            size={20}
            color={record.missed ? "#D87171" : colors.muted}
          />
          <View style={s.body}>
            <Text
              style={[
                s.label,
                { color: record.missed ? "#D87171" : colors.fg },
              ]}
            >
              {record.missed ? "Missed " : ""}
              {record.video ? "Video" : "Voice"} call
            </Text>
            <Text style={[s.caption, { color: colors.muted }]}>
              {record.time}
              {!record.missed ? ` · ${formatDuration(record.seconds)}` : ""}
            </Text>
          </View>
          <IconButton
            name={record.video ? "videocam-outline" : "call-outline"}
            color={coral}
            label={`Start ${record.video ? "video" : "voice"} call with ${chat.name}`}
            onPress={() => onCall(record.video)}
          />
        </View>
      ))}
    </View>
  );
}

export function CallHistoryActions({
  onCall,
  dark,
}: Pick<CallHistoryDetailProps, "onCall" | "dark">) {
  const colors = palette(dark);
  return (
    <View style={s.actions}>
      {([false, true] as const).map((video) => (
        <Pressable
          key={String(video)}
          accessibilityRole="button"
          accessibilityLabel={`Start ${video ? "video" : "voice"} call`}
          onPress={() => onCall(video)}
          style={[s.action, { backgroundColor: colors.tint }]}
        >
          <Ionicons
            name={video ? "videocam-outline" : "call-outline"}
            size={23}
            color={coral}
          />
          <Text style={[s.label, { color: colors.fg }]}>
            {video ? "Video call" : "Voice call"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function CallHistoryDetail({
  chat,
  history,
  dark,
  onBack,
  onProfile,
  onCall,
}: CallHistoryDetailProps) {
  const colors = palette(dark);
  return (
    <View style={[s.screen, { backgroundColor: colors.bg }]}>
      <View style={s.header}>
        <IconButton
          name="arrow-back"
          label="Back"
          color={colors.fg}
          onPress={onBack}
        />
        <Text style={[s.heading, { color: colors.fg }]}>Call history</Text>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${chat.name}'s profile`}
          onPress={onProfile}
          style={s.profile}
        >
          <Avatar uri={chat.avatar} size={88} />
          <Text style={[s.name, { color: colors.fg }]}>{chat.name}</Text>
          <Text style={[s.caption, { color: colors.muted }]}>
            View {chat.group ? "group" : "contact"} profile
          </Text>
        </Pressable>
        <CallHistoryActions dark={dark} onCall={onCall} />
        <Text style={[s.heading, { color: colors.fg }]}>All calls</Text>
        <CallHistoryList
          chat={chat}
          history={history}
          dark={dark}
          onCall={onCall}
        />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16 },
  content: { padding: 24, paddingBottom: 60 },
  heading: { fontFamily: "DMSans_700Bold", fontSize: 20 },
  profile: { alignItems: "center", gap: 12, paddingVertical: 20 },
  name: { fontFamily: "DMSans_700Bold", fontSize: 26, textAlign: "center" },
  actions: { flexDirection: "row", gap: 12, marginVertical: 24 },
  action: {
    flex: 1,
    padding: 18,
    borderRadius: 18,
    alignItems: "center",
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1 },
  label: { fontFamily: "DMSans_500Medium", fontSize: 14 },
  caption: { fontFamily: "DMSans_400Regular", fontSize: 12, marginTop: 5 },
  empty: { fontFamily: "DMSans_400Regular", paddingVertical: 24 },
});
