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
import type { CallRecord } from "../../state/useMessenger";
import { Avatar, IconButton } from "../../ui/primitives";
import { palette, coral } from "../../ui/theme";
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
  history: CallRecord[];
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
            <Avatar uri={record.chat.avatar} />
            <View style={s.body}>
              <Text style={[s.name, { color: colors.fg }]}>
                {record.chat.name}
              </Text>
              <View style={s.meta}>
                <Ionicons
                  name={record.missed ? "arrow-down" : "arrow-up"}
                  size={13}
                  color={record.missed ? "#D87171" : "#78A58A"}
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
                color={coral}
              />
            </Pressable>
          </Pressable>
        ))}
        {!filtered.length && (
          <View style={s.empty}>
            <Ionicons name="call-outline" size={32} color={coral} />
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
    padding: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontFamily: "DMSans_700Bold", fontSize: 36, letterSpacing: -1.6 },
  search: {
    marginHorizontal: 25,
    marginBottom: 18,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 13,
  },
  input: {
    flex: 1,
    padding: 12,
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
  },
  row: {
    paddingHorizontal: 25,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
  },
  body: { flex: 1, marginLeft: 15 },
  callButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontFamily: "DMSans_500Medium", fontSize: 14 },
  meta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 7 },
  caption: { fontFamily: "DMSans_400Regular", fontSize: 12 },
  empty: { padding: 60, alignItems: "center", gap: 20 },
  emptyTitle: { fontFamily: "DMSans_500Medium", fontSize: 18 },
  primary: { backgroundColor: coral, padding: 16, borderRadius: 17 },
  primaryText: { fontFamily: "DMSans_700Bold", color: "#FFF", fontSize: 14 },
});
