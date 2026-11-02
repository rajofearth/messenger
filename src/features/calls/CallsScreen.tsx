import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Chat } from "../../domain/data";
import type { RemoteCallRecord } from "../../state/remoteMessengerTypes";
import { Avatar, IconButton } from "../../ui/primitives";
import { palette, space } from "../../ui/theme";
import { formatDuration } from "../../domain/model";
import QuickActions from "../../ui/QuickActions";
export default function CallsScreen({
  history,
  dark,
  onCall,
  onHistory,
  onNewConversation,
  onVoiceCall,
  onVideoCall,
}: {
  history: RemoteCallRecord[];
  dark: boolean;
  onCall: (chat: Chat, video: boolean) => void;
  onHistory: (chat: Chat) => void;
  onNewConversation: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
}) {
  const colors = palette(dark);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = history.filter((record) =>
    record.chat.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <View style={{ flex: 1 }}>
      <View style={s.header}>
        <Text style={[s.title, { color: colors.fg }]}>Calls</Text>
        <IconButton
          name="search-outline"
          color={colors.fg}
          background={colors.card}
          label="Search calls"
          onPress={() => {
            if (search) setQuery("");
            setSearch((value) => !value);
          }}
        />
      </View>
      {search && (
        <View style={[s.search, { backgroundColor: colors.card }]}>
          <Ionicons name="search-outline" size={19} color={colors.muted} />
          <TextInput
            accessibilityLabel="Search call history"
            autoFocus
            placeholder="Search calls"
            value={query}
            onChangeText={setQuery}
            placeholderTextColor={colors.muted}
            style={[s.input, { color: colors.fg }]}
          />
          <IconButton
            name="close"
            color={colors.muted}
            label="Close search"
            onPress={() => {
              setSearch(false);
              setQuery("");
            }}
          />
        </View>
      )}
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {filtered.map((record) => (
          <Pressable
            key={record.id}
            accessibilityRole="button"
            accessibilityLabel={`View call history with ${record.chat.name}`}
            onPress={() => onHistory(record.chat)}
            style={s.row}
          >
            <Avatar uri={record.chat.avatar} name={record.chat.name} />
            <View style={s.body}>
              <Text style={[s.name, { color: colors.fg }]}>
                {record.chat.name}
              </Text>
              <View style={s.meta}>
                <Ionicons
                  name={record.missed ? "arrow-down" : "arrow-up"}
                  size={13}
                  color={
                    record.missed ? colors.danger : colors.success
                  }
                />
                <Text style={[s.caption, { color: colors.muted }]}>
                  {record.missed
                    ? "Missed call"
                    : formatDuration(record.seconds)}{" "}
                  · {record.time}
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Start ${record.video ? "video" : "voice"} call with ${record.chat.name}`}
              onPress={(event) => {
                event.stopPropagation();
                onCall(record.chat, record.video);
              }}
              style={s.callButton}
            >
              <Ionicons
                name={record.video ? "videocam-outline" : "call-outline"}
                size={23}
                color={colors.fg}
              />
            </Pressable>
          </Pressable>
        ))}
        {!filtered.length && (
          <View style={s.empty}>
            <Ionicons name="call-outline" size={32} color={colors.muted} />
            <Text style={[s.emptyTitle, { color: colors.fg }]}>
              {query.trim() ? "No matching calls" : "No recent calls"}
            </Text>
            {!query.trim() && (
              <Pressable onPress={onVoiceCall} style={s.primary}>
                <Text style={s.primaryText}>Start a call</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
      <QuickActions
        dark={dark}
        onNewConversation={onNewConversation}
        onVoiceCall={onVoiceCall}
        onVideoCall={onVideoCall}
      />
    </View>
  );
}
const s = StyleSheet.create({
  header: {
    padding: space.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 30, fontWeight: "600" },
  search: {
    marginHorizontal: space.xl,
    marginBottom: space.lg,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: space.md,
  },
  input: {
    flex: 1,
    padding: 12,
    fontSize: 13,
  },
  row: {
    paddingHorizontal: 25,
    paddingVertical: space.md,
    flexDirection: "row",
    alignItems: "center",
  },
  body: { flex: 1, marginLeft: space.md },
  callButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 15, fontWeight: "600" },
  meta: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.sm },
  caption: { fontSize: 12 },
  empty: { padding: space.xxxl, alignItems: "center", gap: space.xl },
  emptyTitle: { fontSize: 18, fontWeight: "600" },
  primary: { backgroundColor: "#111111", padding: space.lg, borderRadius: 10 },
  primaryText: { fontWeight: "600", color: "#FFFFFF", fontSize: 14 },
});
