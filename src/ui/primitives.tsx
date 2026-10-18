import React from "react";
import { Image, Platform, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export function tap() {
  if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => {});
}
export function IconButton({
  name,
  onPress,
  label,
  color = "#313730",
  background,
  size = 22,
  hangup = false,
}: {
  name: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  background?: string;
  size?: number;
  hangup?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: pressed ? 0.5 : 1 },
      ]}
    >
      <Ionicons
        name={name}
        size={size}
        color={color}
        style={hangup ? { transform: [{ rotate: "135deg" }] } : undefined}
      />
    </Pressable>
  );
}
export function Avatar({
  uri,
  size = 54,
  online = false,
}: {
  uri: string;
  size?: number;
  online?: boolean;
}) {
  return (
    <View style={{ width: size, height: size }}>
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#E5DCD3",
        }}
      />
      {online && <View style={styles.online} />}
    </View>
  );
}
const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  online: {
    position: "absolute",
    bottom: 0,
    right: 1,
    backgroundColor: "#82A78C",
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
    borderColor: "#FBFAF7",
  },
});
