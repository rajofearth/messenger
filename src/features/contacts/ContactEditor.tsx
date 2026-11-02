import React, { useEffect, useState } from "react";
import {
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
import { palette, radius, space } from "../../ui/theme";
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
  const [error, setError] = useState("");
  const base = palette(dark);
  const colors = {
    ...base,
    bg: dark ? "#111111" : "#FFFFFF",
    fg: dark ? "#F5F5F5" : "#111111",
    muted: dark ? "#A6A6A6" : "#6B6B6B",
    card: dark ? "#171717" : "#FFFFFF",
    switchTrackOn: dark ? "#F5F5F5" : "#111111",
    onCoral: dark ? "#111111" : "#FFFFFF",
  };
  useEffect(() => {
    setName("");
    setHandle("");
    setError("");
  }, [kind]);
  function save() {
    if (!name.trim() || !handle.trim()) {
      setError(
        kind === "group"
          ? "Enter a group name and at least one member username"
          : "Enter a name and username",
      );
      return;
    }
    setError("");
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
            <Text
              accessibilityRole="header"
              style={[s.title, { color: colors.fg }]}
            >
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
            onChangeText={(value) => {
              setError("");
              setName(value);
            }}
            maxLength={70}
            style={[
              s.input,
              { color: colors.fg, backgroundColor: colors.card },
            ]}
          />
          {kind === "contact" ? (
            <TextInput
              accessibilityLabel="Username"
              placeholder="@username"
              placeholderTextColor={colors.muted}
              value={handle}
              onChangeText={(value) => {
                setError("");
                setHandle(value);
              }}
              autoCapitalize="none"
              maxLength={100}
              style={[
                s.input,
                { color: colors.fg, backgroundColor: colors.card },
              ]}
            />
          ) : (
            <TextInput
              accessibilityLabel="Member usernames"
              placeholder="Member @usernames, separated by commas"
              placeholderTextColor={colors.muted}
              value={handle}
              onChangeText={(value) => {
                setError("");
                setHandle(value);
              }}
              autoCapitalize="none"
              multiline
              maxLength={400}
              style={[
                s.input,
                s.members,
                { color: colors.fg, backgroundColor: colors.card },
              ]}
            />
          )}
          <Text style={[s.helper, { color: error ? colors.danger : colors.muted }]}
          >
            {error ||
              (kind === "group"
                ? "Separate member usernames with commas"
                : "Use the username they use on Messenger")}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={kind === "group" ? "Create group" : "Add contact"}
            onPress={save}
            style={[s.primary, { backgroundColor: colors.switchTrackOn }]}
          >
            <Text style={[s.primaryText, { color: colors.onCoral }]}>
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
    backgroundColor: "transparent",
  },
  sheet: {
    borderTopLeftRadius: radius.control,
    borderTopRightRadius: radius.control,
    padding: space.xxl,
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 22, fontWeight: "600" },
  input: {
    borderRadius: radius.control,
    padding: space.lg,
    fontSize: 15,
  },
  members: { minHeight: 92, textAlignVertical: "top" },
  helper: { fontSize: 12, lineHeight: 18, marginTop: -space.sm },
  primary: {
    padding: space.lg,
    borderRadius: radius.control,
    alignItems: "center",
  },
  primaryText: { fontSize: 14, fontWeight: "600" },
});
