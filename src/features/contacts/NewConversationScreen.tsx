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
import { coral, palette } from "../../ui/theme";

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
  const colors = { ...base, text: base.fg, input: base.card };
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
          selectionColor={coral}
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
            accessibilityLabel={chat.name}
            onPress={() => onSelect(chat)}
            style={({ pressed }) => [s.row, pressed && s.pressed]}
          >
            <Avatar uri={chat.avatar} name={chat.name} size={52} />
            <Text style={[s.name, { color: colors.text }]}>{chat.name}</Text>
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 8,
  },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, fontFamily: "DMSans_700Bold", fontSize: 26 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 24,
    marginBottom: 16,
    paddingLeft: 16,
    paddingRight: 4,
    borderRadius: 18,
    minHeight: 52,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
  },
  clearButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { paddingHorizontal: 24, paddingBottom: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 76,
    paddingVertical: 10,
    gap: 16,
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { flex: 1, fontFamily: "DMSans_500Medium", fontSize: 17 },
  section: {
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  sectionLabel: { fontFamily: "DMSans_700Bold", fontSize: 14 },
  empty: {
    textAlign: "center",
    paddingVertical: 40,
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
  },
  pressed: { opacity: 0.55 },
});
