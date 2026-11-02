import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { imageCacheKey } from "../domain/imageVariants";
import { useAvatarUri } from "./useAvatarUri";
import { palette, radius } from "./theme";
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
  color = palette(false).fg,
  background,
  size = 20,
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
  dark = false,
}: {
  uri?: string;
  name?: string;
  size?: number;
  dark?: boolean;
}) {
  const colors = palette(dark);
  const [failed, setFailed] = React.useState(false);
  const imageUri = useAvatarUri(uri);
  React.useEffect(() => setFailed(false), [imageUri]);
  const initials = avatarInitials(name);
  const fallback = !imageUri || failed;
  const cacheKey = imageUri ? imageCacheKey(imageUri) : undefined;
  return (
    <View style={{ width: size, height: size }}>
      {fallback ? (
        <View
          accessible={false}
          style={[
            styles.avatarFallback,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: colors.tint,
            },
          ]}
        >
          {initials ? (
            <Text
              style={[
                styles.initials,
                { fontSize: Math.max(11, size * 0.34), color: colors.fg },
              ]}
            >
              {initials}
            </Text>
          ) : (
            <Ionicons
              name="person"
              size={size * 0.48}
              color={colors.muted}
            />
          )}
        </View>
      ) : (
        <Image
          source={{ uri: imageUri, cacheKey }}
          cachePolicy="memory-disk"
          contentFit="cover"
          allowDownscaling
          recyclingKey={cacheKey ?? imageUri}
          accessible={false}
          onError={() => setFailed(true)}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.input,
          }}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontFamily: "DMSans_500Medium",
    letterSpacing: 0,
  },
});
