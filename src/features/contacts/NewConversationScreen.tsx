import React, { useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Chat } from "../../domain/data";
import { Avatar } from "../../ui/primitives";
import { palette, radius, space } from "../../ui/theme";

export type NewConversationScreenProps = {
  contacts: Chat[];
  dark: boolean;
  mode: "message" | "voice" | "video";
  onBack: () => void;
  onSelect: (chat: Chat) => void;
  onNewContact: () => void;
  onNewGroup: () => void;
};

const titles = {
  message: "New conversation",
  voice: "Voice call",
  video: "Video call",
};

export default function NewConversationScreen({
  contacts,
  dark,
  mode,
  onBack,
  onSelect,
  onNewContact,
  onNewGroup,
}: NewConversationScreenProps) {
  const [search, setSearch] = useState("");
  const base = palette(dark);
  const colors = {
    ...base,
    bg: dark ? "#111111" : "#FFFFFF",
    fg: dark ? "#F5F5F5" : "#111111",
    text: dark ? "#F5F5F5" : "#111111",
    muted: dark ? "#A6A6A6" : "#6B6B6B",
    input: dark ? "#202020" : "#F4F4F4",
    tint: dark ? "#242424" : "#F4F4F4",
    coralInk: dark ? "#F5F5F5" : "#111111",
  };
  const query = search.trim().toLowerCase();
  const people = contacts.filter((chat) => !chat.group);
  const filtered = people.filter((chat) =>
    chat.name.toLowerCase().includes(query),
  );

  return (
    <View style={[s.screen, { backgroundColor: colors.bg }]}>
      <View style={s.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          style={({ pressed }) => [s.iconButton, pressed && s.pressed]}
        >
          <Ionicons
            name="arrow-back"
            size={25}
            color={colors.text}
            accessible={false}
          />
        </Pressable>
        <Text
          accessibilityRole="header"
          style={[s.title, { color: colors.text }]}
        >
          {titles[mode]}
        </Text>
      </View>

      <View style={[s.search, { backgroundColor: colors.input }]}>
        <Ionicons
          name="search-outline"
          size={21}
          color={colors.muted}
          accessible={false}
        />
        <TextInput
          accessibilityLabel="Search contacts"
          placeholder="Search contacts"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          selectionColor={colors.coralInk}
          style={[s.searchInput, { color: colors.text }]}
        />
        {search.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => setSearch("")}
            style={({ pressed }) => [s.clearButton, pressed && s.pressed]}
          >
            <Ionicons
              name="close-circle"
              size={20}
              color={colors.muted}
              accessible={false}
            />
          </Pressable>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(chat) => chat.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View>
            {mode === "message" &&
              (
                [
                  {
                    label: "New contact",
                    icon: "person-add-outline",
                    onPress: onNewContact,
                  },
                  {
                    label: "Create group",
                    icon: "people-outline",
                    onPress: onNewGroup,
                  },
                ] as const
              ).map((action) => (
                <Pressable
                  key={action.label}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  onPress={action.onPress}
                  style={({ pressed }) => [s.row, pressed && s.pressed]}
                >
                  <View
                    style={[s.actionIcon, { backgroundColor: colors.tint }]}
                  >
                    <Ionicons
                      name={action.icon}
                      size={23}
                      color={colors.coralInk}
                      accessible={false}
                    />
                  </View>
                  <Text style={[s.name, { color: colors.text }]}>
                    {action.label}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.muted}
                    accessible={false}
                  />
                </Pressable>
              ))}
            <View style={[s.section, { borderTopColor: colors.line }]}>
              <Text
                accessibilityRole="header"
                style={[s.sectionLabel, { color: colors.muted }]}
              >
                Contacts
              </Text>
            </View>
          </View>
        }
        renderItem={({ item: chat }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${chat.name}${
              chat.username ? `, @${chat.username.replace(/^@/, "")}` : ""
            }`}
            onPress={() => onSelect(chat)}
            style={({ pressed }) => [s.row, pressed && s.pressed]}
          >
            <Avatar uri={chat.avatar} name={chat.name} size={52} />
            <View style={s.rowCopy}>
              <Text style={[s.name, { color: colors.text }]}>{chat.name}</Text>
              {!!chat.username && (
                <Text style={[s.handle, { color: colors.muted }]}>
                  @{chat.username.replace(/^@/, "")}
                </Text>
              )}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text
            accessibilityLiveRegion="polite"
            style={[s.empty, { color: colors.muted }]}
          >
            {people.length === 0 ? "No contacts yet" : "No matching contacts"}
          </Text>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.xxl,
    paddingTop: space.md,
    paddingBottom: space.xl,
    gap: space.sm,
  },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, fontSize: 24, fontWeight: "600" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: space.xxl,
    marginBottom: space.lg,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    borderRadius: 16,
    minHeight: 52,
    gap: space.sm,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: space.md,
    fontSize: 15,
  },
  clearButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { paddingHorizontal: space.xxl, paddingBottom: space.xxl },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 76,
    paddingVertical: space.sm,
    gap: space.lg,
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: { flex: 1, minWidth: 0 },
  name: { flex: 1, fontSize: 17, fontWeight: "600" },
  handle: { fontSize: 12, marginTop: space.xs },
  section: {
    borderTopWidth: 1,
    marginTop: space.lg,
    paddingTop: space.xxl,
    paddingBottom: space.sm,
  },
  sectionLabel: { fontSize: 14, fontWeight: "600" },
  empty: {
    textAlign: "center",
    paddingVertical: space.xxxl + space.sm,
    fontSize: 15,
  },
  pressed: { opacity: 0.55 },
});
