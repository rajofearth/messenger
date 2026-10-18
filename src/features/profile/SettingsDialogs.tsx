import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { styles, type SettingsColors } from "./SettingsScreen.styles";
import type { useSettingsPreferences } from "./SettingsPreferences";

type SettingsDialogsProps = {
  settings: ReturnType<typeof useSettingsPreferences>;
  colors: SettingsColors;
};

export default function SettingsDialogs({
  settings,
  colors,
}: SettingsDialogsProps) {
  const {
    sheet,
    setSheet,
    name,
    setName,
    bio,
    setBio,
    username,
    setUsername,
    saving,
    saveProfile,
    picking,
    pickAvatar,
  } = settings;
  const insets = useSafeAreaInsets();
  const busy = saving || picking;
  const icon = (
    name: React.ComponentProps<typeof Ionicons>["name"],
    size = 21,
  ) => <Ionicons name={name} size={size} color={colors.text} />;
  return (
    <Modal
      visible={sheet !== null}
      presentationStyle="fullScreen"
      animationType="slide"
      onRequestClose={() => {
        if (!busy) setSheet(null);
      }}
    >
      <KeyboardAvoidingView
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          accessibilityViewIsModal
          style={{
            flex: 1,
            paddingHorizontal: 24,
            paddingTop: 16,
            backgroundColor: colors.bg,
          }}
        >
          <View style={styles.modalHeader}>
            <Text
              accessibilityRole="header"
              style={[styles.modalTitle, { color: colors.text }]}
            >
              {sheet === "profile"
                ? "Edit profile"
                : sheet === "privacy"
                  ? "Privacy"
                  : "About"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close dialog"
              disabled={busy}
              hitSlop={10}
              onPress={() => setSheet(null)}
            >
              {icon("close", 24)}
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingBottom: 32 }}
            style={{ flex: 1 }}
          >
            {sheet === "profile" ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change profile photo"
                  disabled={busy}
                  onPress={() => void pickAvatar()}
                  style={[
                    styles.edit,
                    {
                      alignSelf: "center",
                      backgroundColor: colors.tint,
                      marginBottom: 24,
                    },
                  ]}
                >
                  {picking ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    icon("camera-outline")
                  )}
                  <Text style={[styles.editText, { color: colors.text }]}>
                    Change photo
                  </Text>
                </Pressable>
                <Text style={[styles.label, { color: colors.text }]}>Name</Text>
                <TextInput
                  accessibilityLabel="Name"
                  value={name}
                  onChangeText={setName}
                  maxLength={50}
                  autoCapitalize="words"
                  editable={!busy}
                  style={[
                    styles.input,
                    { color: colors.text, backgroundColor: colors.input },
                  ]}
                  placeholder="Your name"
                  placeholderTextColor={colors.muted}
                />
                <Text style={[styles.label, { color: colors.text }]}>
                  Username
                </Text>
                <TextInput
                  accessibilityLabel="Username"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={31}
                  editable={!busy}
                  placeholder="@username"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    { color: colors.text, backgroundColor: colors.input },
                  ]}
                />
                <Text style={[styles.label, { color: colors.text }]}>Bio</Text>
                <TextInput
                  accessibilityLabel="Bio"
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  maxLength={160}
                  editable={!busy}
                  style={[
                    styles.input,
                    styles.bioInput,
                    { color: colors.text, backgroundColor: colors.input },
                  ]}
                  placeholder="About you"
                  placeholderTextColor={colors.muted}
                />
                <Text style={[styles.counter, { color: colors.muted }]}>
                  {bio.length}/160
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void saveProfile()}
                  style={[styles.primary, { opacity: busy ? 0.65 : 1 }]}
                >
                  {saving ? (
                    <ActivityIndicator color="#29372F" />
                  ) : (
                    <Text style={styles.primaryText}>Save changes</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <View
                  style={[styles.modalSymbol, { backgroundColor: colors.tint }]}
                >
                  {icon(
                    sheet === "privacy"
                      ? "shield-checkmark-outline"
                      : "chatbubbles-outline",
                    30,
                  )}
                </View>
                <Text style={[styles.modalBody, { color: colors.text }]}>
                  {sheet === "privacy"
                    ? "This is a local mock prototype. There is no server, no account service, and no real messaging or calling. Conversations and incoming calls are simulated."
                    : "A local messenger prototype with simulated conversations and incoming calls."}
                </Text>
                <Text style={[styles.modalBody, { color: colors.muted }]}>
                  {sheet === "privacy"
                    ? "Your profile and notification preferences are saved on this device using local app storage, not encrypted secure storage. A selected profile photo stays on this device. Default remote avatars are fetched from Unsplash, which receives a normal image request. Notification preferences do not register you for push notifications. Avoid entering sensitive information. Clearing app data removes these saved preferences."
                    : "Built with Expo and React Native. Profile edits and notification preferences are stored locally. This prototype does not connect to a messaging service or place real calls."}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSheet(null)}
                  style={styles.primary}
                >
                  <Text style={styles.primaryText}>Got it</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
