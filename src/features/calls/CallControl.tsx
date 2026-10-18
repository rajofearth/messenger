import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CORAL, styles } from "./CallScreen.styles";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export default function CallControl({
  icon,
  label,
  active = false,
  danger = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.control}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => [
          styles.controlButton,
          active && styles.controlActive,
          danger && styles.hangup,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons
          name={icon}
          size={24}
          color={active && !danger ? CORAL : "#FFFFFF"}
          style={danger && icon === "call" ? styles.hangupIcon : undefined}
        />
      </Pressable>
      <Text
        style={[styles.controlLabel, danger && styles.endLabel]}
        numberOfLines={1}
      >
        {danger
          ? "End"
          : label === "Turn microphone on"
            ? "Unmute"
            : label === "Turn microphone off"
              ? "Mute"
              : label === "Turn video on" || label === "Turn video off"
                ? "Video"
                : label === "Open chat"
                  ? "Chat"
                  : "More"}
      </Text>
    </View>
  );
}
