import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { tap, type IconName } from "../../ui/primitives";
import { coral, palette } from "../../ui/theme";

export default function AttachmentMenu({
  dark,
  maxHeight,
  onClose,
  onPhoto,
  onFile,
  onRecord,
}: {
  dark: boolean;
  maxHeight: number;
  onClose: () => void;
  onPhoto: (camera: boolean) => void;
  onFile: () => void;
  onRecord: () => void;
}) {
  const { card, fg } = palette(dark);
  const actions: { icon: IconName; title: string; run: () => void }[] = [
    {
      icon: "images-outline",
      title: "Photos and videos",
      run: () => onPhoto(false),
    },
    { icon: "camera-outline", title: "Camera", run: () => onPhoto(true) },
    { icon: "document-attach-outline", title: "File", run: onFile },
    { icon: "mic-outline", title: "Voice note", run: onRecord },
  ];
  return (
    <View
      style={[styles.popup, { backgroundColor: card, maxHeight }]}
      accessibilityViewIsModal
    >
      <ScrollView keyboardShouldPersistTaps="always">
        {actions.map(({ icon, title, run }) => (
          <Pressable
            key={title}
            accessibilityRole="button"
            style={styles.row}
            onPress={() => {
              tap();
              onClose();
              run();
            }}
          >
            <Ionicons name={icon} size={23} color={coral} />
            <Text style={{ color: fg, fontSize: 15 }}>{title}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  popup: {
    position: "absolute",
    bottom: "100%",
    left: 16,
    width: 240,
    borderRadius: 18,
    padding: 8,
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    zIndex: 10,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 12 },
});
