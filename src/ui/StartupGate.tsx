/**
 * Owns the bundled font load so every screen paints with the intended face.
 *
 * The splash is the same mark the messenger uses while its local cache loads.
 * A font failure still starts the app: falling back to the platform face is
 * better than a splash that never leaves.
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFonts } from "expo-font";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_600SemiBold } from "@expo-google-fonts/dm-sans/600SemiBold";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { useDeviceScheme } from "../state/useDeviceScheme";
import { palette } from "./theme";

export default function StartupGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loaded, error] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });
  const scheme = useDeviceScheme();

  if (!loaded && !error) {
    const colors = palette(scheme === "dark");
    return (
      <View style={[s.splash, { backgroundColor: colors.bg }]}>
        <Ionicons name="chatbubble-ellipses" size={42} color={colors.coralInk} />
      </View>
    );
  }
  return <>{children}</>;
}

const s = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
