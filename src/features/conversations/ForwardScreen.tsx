import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Chat, Message } from "../../domain/data";
import { Avatar, IconButton } from "../../ui/primitives";
import { coral, palette } from "../../ui/theme";
export default function ForwardScreen({
  chats,
  message,
  dark,
  onBack,
  onForward,
}: {
  chats: Chat[];
  message: Message;
  dark: boolean;
  onBack: () => void;
  onForward: (ids: string[]) => void;
}) {
  const colors = palette(dark);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const filtered = chats.filter(
    (chat) =>
      !chat.blocked &&
      chat.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const summary =
    message.text ||
    (message.kind === "file"
      ? message.filename
      : message.kind === "audio"
        ? "Voice message"
        : message.kind === "video"
          ? "Video"
          : "Photo");
  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={s.header}>
        <IconButton
          name="arrow-back"
          label="Cancel forwarding"
          color={colors.fg}
          onPress={onBack}
        />
        <Text style={[s.title, { color: colors.fg }]}>Forward message</Text>
      </View>
      <View
        style={[
          s.preview,
          { backgroundColor: colors.card, borderLeftColor: coral },
        ]}
      >
        <Text style={[s.label, { color: coral }]}>Forwarding</Text>
        <Text numberOfLines={2} style={[s.text, { color: colors.fg }]}>
          {summary}
        </Text>
      </View>
      <TextInput
        accessibilityLabel="Search forwarding recipients"
        placeholder="Search people and groups"
        value={query}
        onChangeText={setQuery}
        placeholderTextColor={colors.muted}
        style={[s.input, { backgroundColor: colors.card, color: colors.fg }]}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={s.root}
      >
        {filtered.map((chat) => (
          <Pressable
            key={chat.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected.includes(chat.id) }}
            accessibilityLabel={chat.name}
            onPress={() =>
              setSelected((ids) =>
                ids.includes(chat.id)
                  ? ids.filter((id) => id !== chat.id)
                  : [...ids, chat.id],
              )
            }
            style={s.row}
          >
            <Avatar uri={chat.avatar} size={47} />
            <View style={s.body}>
              <Text style={[s.name, { color: colors.fg }]}>{chat.name}</Text>
              <Text style={[s.text, { color: colors.muted }]}>
                {chat.group ? "Group" : "Contact"}
              </Text>
            </View>
            <Ionicons
              name={
                selected.includes(chat.id)
                  ? "checkmark-circle"
                  : "ellipse-outline"
              }
              color={selected.includes(chat.id) ? coral : colors.muted}
              size={25}
            />
          </Pressable>
        ))}
        {!filtered.length && (
          <Text style={[s.empty, { color: colors.muted }]}>
            No available conversations
          </Text>
        )}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !selected.length }}
        disabled={!selected.length}
        onPress={() => onForward(selected)}
        style={[s.send, { opacity: selected.length ? 1 : 0.4 }]}
      >
        <Ionicons name="arrow-redo" size={20} color="white" />
        <Text style={s.sendText}>
          Forward{selected.length ? ` · ${selected.length}` : ""}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", padding: 13, gap: 10 },
  title: { fontFamily: "DMSans_700Bold", fontSize: 23 },
  preview: {
    margin: 20,
    marginTop: 4,
    borderRadius: 14,
    borderLeftWidth: 3,
    padding: 15,
    gap: 6,
  },
  label: { fontFamily: "DMSans_500Medium", fontSize: 12 },
  text: { fontFamily: "DMSans_400Regular", fontSize: 13, lineHeight: 20 },
  input: {
    marginHorizontal: 20,
    padding: 15,
    borderRadius: 14,
    fontFamily: "DMSans_400Regular",
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  body: { flex: 1, gap: 3 },
  name: { fontFamily: "DMSans_500Medium", fontSize: 15 },
  empty: { textAlign: "center", margin: 40 },
  send: {
    margin: 20,
    borderRadius: 20,
    backgroundColor: coral,
    padding: 17,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  sendText: { color: "#FFF", fontFamily: "DMSans_700Bold", fontSize: 15 },
});
