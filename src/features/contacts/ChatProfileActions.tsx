import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { palette, space } from "../../ui/theme";
import type { IconName } from "../../ui/primitives";

export default function ChatProfileActions({
  group,
  dark,
  onMessage,
  onCall,
}: {
  group?: boolean;
  dark: boolean;
  onMessage: () => void;
  onCall: (video: boolean) => void;
}) {
  const colors = {
    ...palette(dark),
    fg: dark ? "#F5F5F5" : "#111111",
    muted: dark ? "#A6A6A6" : "#6B6B6B",
    tint: dark ? "#242424" : "#F4F4F4",
  };
  const actions: Array<{ icon: IconName; label: string; run: () => void }> = [
    { icon: "chatbubble-outline", label: "Message", run: onMessage },
    ...(!group
      ? [
          {
            icon: "call-outline" as const,
            label: "Voice call",
            run: () => onCall(false),
          },
          {
            icon: "videocam-outline" as const,
            label: "Video call",
            run: () => onCall(true),
          },
        ]
      : []),
  ];
  return (
    <>
      <View style={s.actions}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.run}
            style={({ pressed }) => [
              s.action,
              { backgroundColor: colors.tint, opacity: pressed ? 0.62 : 1 },
            ]}
          >
            <Ionicons
              name={action.icon}
              size={22}
              color={colors.fg}
              accessible={false}
            />
            <Text style={[s.actionText, { color: colors.fg }]}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {group && (
        <Text style={[s.note, { color: colors.muted }]}>
          Open a member's conversation to start a one-to-one call.
        </Text>
      )}
    </>
  );
}

const s = StyleSheet.create({
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.xl },
  action: {
    flex: 1,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
  },
  actionText: { fontSize: 12, fontWeight: "600" },
  note: { fontSize: 12, lineHeight: 19, marginTop: space.md, marginHorizontal: space.xs },
});
