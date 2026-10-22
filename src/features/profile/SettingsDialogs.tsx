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
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { clearAvatarCache } from "../../data/avatars";
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
    preferences,
    avatarFailed,
    setAvatarFailed,
  } = settings;
  const insets = useSafeAreaInsets();
  const [avatarsCleared, setAvatarsCleared] = React.useState(false);
  React.useEffect(() => {
    if (sheet !== "privacy") setAvatarsCleared(false);
  }, [sheet]);
  /** Contact photos are cached locally for notifications; this frees that space. */
  function clearAvatars() {
    clearAvatarCache();
    setAvatarsCleared(true);
  }
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
                <View style={[styles.avatarWrap, { alignSelf: "center", marginBottom: 16 }]}>
                  {avatarFailed ? (
                    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.tint }]}>
                      {icon("person-outline", 36)}
                    </View>
                  ) : (
                    <Image
                      source={{ uri: preferences.avatar }}
                      style={styles.avatar}
                      accessibilityLabel="Current profile photo"
                      onError={() => setAvatarFailed(true)}
                    />
                  )}
                </View>
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
                    <ActivityIndicator color={colors.onCoral} />
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
                    ? "Your account, profile, contacts, conversations, messages and stories live on this app's Convex deployment. The app also keeps a local cache on this device so chats open offline."
                    : "A Convex-backed messenger built with Expo and React Native. Accounts, chats, presence and stories sync through a Convex deployment, with a local cache for offline use."}
                </Text>
                <Text style={[styles.modalBody, { color: colors.muted }]}>
                  {sheet === "privacy"
                    ? "The local cache is not encrypted by the app. Profile photos and shared media are uploaded to Convex storage; received media stays in app storage unless the conversation's Save media to gallery switch is on, which also copies photos and videos into a Messenger album. There is no end-to-end encryption, so treat the deployment and this device as trusted. Signing out removes the local account cache, not the messages already stored on the deployment."
                    : "Voice and video calls connect on a timer and use a placeholder for the remote video because there is no call transport. Notifications are posted by the running app, not by a push service."}
                </Text>
                {sheet === "privacy" && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={clearAvatars}
                    style={[styles.secondary, { marginTop: 14 }]}
                  >
                    <Text style={[styles.secondaryText, { color: colors.coralInk }]}>
                      {avatarsCleared
                        ? "Downloaded avatars cleared"
                        : "Clear downloaded avatars"}
                    </Text>
                  </Pressable>
                )}
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
