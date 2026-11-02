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
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Chat, Message } from "../../domain/data";
import { Avatar, IconButton } from "../../ui/primitives";
import { palette, radius, space } from "../../ui/theme";
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
          { backgroundColor: colors.card, borderLeftColor: colors.coralInk },
        ]}
      >
        <Text style={[s.label, { color: colors.coralInk }]}>Forwarding</Text>
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
            <Avatar uri={chat.avatar} name={chat.name} size={47} />
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
              color={selected.includes(chat.id) ? colors.coralInk : colors.muted}
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
        style={[s.send, { backgroundColor: colors.switchTrackOn, opacity: selected.length ? 1 : 0.4 }]}
      >
        <Ionicons name="arrow-redo" size={20} color={colors.onCoral} />
        <Text style={[s.sendText, { color: colors.onCoral }]}>
          Forward{selected.length ? ` · ${selected.length}` : ""}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", padding: space.md, gap: space.sm },
  title: { fontFamily: "DMSans_500Medium", fontSize: 23 },
  preview: {
    margin: space.xl,
    marginTop: space.xs,
    borderRadius: radius.card,
    borderLeftWidth: 3,
    padding: space.lg,
    gap: space.xs,
  },
  label: { fontFamily: "DMSans_500Medium", fontSize: 12 },
  text: { fontFamily: "DMSans_400Regular", fontSize: 13, lineHeight: 20 },
  input: {
    marginHorizontal: space.xl,
    padding: space.lg,
    borderRadius: radius.card,
    fontFamily: "DMSans_400Regular",
    marginBottom: space.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  body: { flex: 1, gap: space.xs },
  name: { fontFamily: "DMSans_500Medium", fontSize: 15 },
  empty: { textAlign: "center", margin: space.xxxl },
  send: {
    margin: space.xl,
    borderRadius: radius.pill,
    padding: space.lg,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: space.sm,
  },
  sendText: { fontFamily: "DMSans_500Medium", fontSize: 15 },
});
