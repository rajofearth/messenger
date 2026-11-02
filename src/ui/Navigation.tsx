import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Avatar, tap } from "./primitives";
import { palette, space } from "./theme";
export type Tab = "chats" | "calls" | "settings";
export default function Navigation({
  active,
  avatar,
  name,
  dark,
  onChange,
}: {
  active: Tab;
  avatar: string;
  name?: string;
  dark: boolean;
  onChange: (tab: Tab) => void;
}) {
  const colors = palette(dark);
  return (
    <View
      style={[
        s.nav,
        { backgroundColor: colors.card, borderColor: colors.line },
      ]}
    >
      {(
        [
          {
            id: "chats",
            icon: "chatbubbles-outline",
            filled: "chatbubbles",
            label: "Chats",
          },
          { id: "calls", icon: "call-outline", filled: "call", label: "Calls" },
          {
            id: "settings",
            icon: "person-outline",
            filled: "person",
            label: "Profile",
          },
        ] as const
      ).map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="tab"
          accessibilityLabel={item.label}
          accessibilityState={{ selected: active === item.id }}
          onPress={() => {
            tap();
            onChange(item.id);
          }}
          style={s.item}
        >
          <View style={s.icon}>
            {item.id === "settings" ? (
              <Avatar uri={avatar} name={name} size={28} dark={dark} />
            ) : (
              <Ionicons
                name={active === item.id ? item.filled : item.icon}
                size={23}
                color={active === item.id ? colors.unread : colors.muted}
              />
            )}
          </View>
          <Text
            style={[
              s.label,
              { color: active === item.id ? colors.unread : colors.muted },
            ]}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
const s = StyleSheet.create({
  nav: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    gap: space.xs,
  },
  icon: {
    width: 32,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: "sans-serif",
    fontSize: 12,
    lineHeight: 16,
  },
});
