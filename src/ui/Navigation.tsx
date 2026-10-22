import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Avatar, tap } from "./primitives";
import { palette } from "./theme";
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
              <Avatar uri={avatar} name={name} size={27} />
            ) : (
              <Ionicons
                name={active === item.id ? item.filled : item.icon}
                size={23}
                color={active === item.id ? colors.coralInk : colors.muted}
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
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 36,
    marginHorizontal: 36,
    marginTop: 8,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    elevation: 3,
    shadowColor: "#30251B",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
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
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
