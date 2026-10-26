import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { imageCacheKey } from "../domain/imageVariants";
export type IconName = React.ComponentProps<typeof Ionicons>["name"];
let hapticsEnabled = true;
export function setHapticsEnabled(enabled: boolean) {
  hapticsEnabled = enabled;
}
export function tap() {
  if (hapticsEnabled && Platform.OS !== "web")
    void Haptics.selectionAsync().catch(() => {});
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
/** The first letter of the first two words, so "Ada Lovelace" becomes "AL". */
function avatarInitials(name: string | undefined) {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({
  uri,
  name,
  size = 54,
  online = false,
}: {
  uri?: string;
  name?: string;
  size?: number;
  online?: boolean;
}) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [uri]);
  const initials = avatarInitials(name);
  const fallback = !uri || failed;
  const cacheKey = uri ? imageCacheKey(uri) : undefined;
  return (
    <View style={{ width: size, height: size }}>
      {fallback ? (
        <View
          accessible={false}
          style={[
            styles.avatarFallback,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          {initials ? (
            <Text style={[styles.initials, { fontSize: Math.max(11, size * 0.34) }]}>
              {initials}
            </Text>
          ) : (
            <Ionicons name="person" size={size * 0.48} color="#6B5A4E" />
          )}
        </View>
      ) : (
        <Image
          source={{ uri, cacheKey }}
          cachePolicy="memory-disk"
          contentFit="cover"
          allowDownscaling
          recyclingKey={cacheKey ?? uri}
          accessible={false}
          onError={() => setFailed(true)}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: "#E5DCD3",
          }}
        />
      )}
      {online && <View style={styles.online} />}
    </View>
  );
}
const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallback: {
    backgroundColor: "#E5DCD3",
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: "#5B4A3F",
    fontFamily: "DMSans_700Bold",
    letterSpacing: 0.3,
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
