import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar, tap } from "./primitives";
import { coral, palette } from "./theme";
export type Tab = "chats" | "calls" | "settings";
export default function Navigation({
  active,
  avatar,
  dark,
  onChange,
}: {
  active: Tab;
  avatar: string;
  dark: boolean;
  onChange: (tab: Tab) => void;
}) {
  const colors = palette(dark);
  return (
    <View
      style={[
        s.nav,
        { backgroundColor: colors.card, borderTopColor: colors.line },
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
          <View
            style={[
              s.icon,
              active === item.id && { backgroundColor: colors.tint },
            ]}
          >
            {item.id === "settings" ? (
              <Avatar uri={avatar} size={27} />
            ) : (
              <Ionicons
                name={active === item.id ? item.filled : item.icon}
                size={23}
                color={active === item.id ? coral : colors.muted}
              />
            )}
          </View>
        </Pressable>
      ))}
    </View>
  );
}
const s = StyleSheet.create({
  nav: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 30,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  icon: {
    width: 55,
    height: 39,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
});
