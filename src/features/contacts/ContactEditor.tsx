import React, { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { IconButton } from "../../ui/primitives";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette, coral } from "../../ui/theme";
export default function ContactEditor({
  kind,
  dark,
  onClose,
  onSave,
}: {
  kind: "contact" | "group" | null;
  dark: boolean;
  onClose: () => void;
  onSave: (name: string, handle: string, group: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const colors = palette(dark);
  useEffect(() => {
    setName("");
    setHandle("");
  }, [kind]);
  function save() {
    if (!name.trim() || (kind === "contact" && !handle.trim())) {
      Alert.alert(
        "Missing details",
        kind === "group"
          ? "Enter a group name."
          : "Enter a name and phone number or username.",
      );
      return;
    }
    onSave(name.trim(), handle.trim(), kind === "group");
  }
  return (
    <Modal
      visible={kind !== null}
      presentationStyle="fullScreen"
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[
          s.overlay,
          {
            backgroundColor: colors.bg,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[s.sheet, { backgroundColor: colors.bg }]}
        >
          <View style={s.header}>
            <Text style={[s.title, { color: colors.fg }]}>
              {kind === "group" ? "Create group" : "New contact"}
            </Text>
            <IconButton
              name="close"
              color={colors.fg}
              label="Close editor"
              onPress={onClose}
            />
          </View>
          <TextInput
            autoFocus
            accessibilityLabel={
              kind === "group" ? "Group name" : "Contact name"
            }
            placeholder={kind === "group" ? "Group name" : "Full name"}
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
            maxLength={70}
            style={[
              s.input,
              { color: colors.fg, backgroundColor: colors.card },
            ]}
          />
          {kind === "contact" && (
            <TextInput
              accessibilityLabel="Phone number or username"
              placeholder="Phone number or @username"
              placeholderTextColor={colors.muted}
              value={handle}
              onChangeText={setHandle}
              autoCapitalize="none"
              maxLength={100}
              style={[
                s.input,
                { color: colors.fg, backgroundColor: colors.card },
              ]}
            />
          )}
          <Pressable
            accessibilityRole="button"
            onPress={save}
            style={s.primary}
          >
            <Text style={s.primaryText}>
              {kind === "group" ? "Create group" : "Add contact"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#FBFAF7",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    gap: 15,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontFamily: "DMSans_700Bold", fontSize: 23 },
  input: {
    borderRadius: 14,
    padding: 16,
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
  },
  primary: {
    backgroundColor: coral,
    padding: 16,
    borderRadius: 17,
    alignItems: "center",
  },
  primaryText: { fontFamily: "DMSans_700Bold", color: "#FFF", fontSize: 14 },
});
