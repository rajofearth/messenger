import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CORAL, styles, settingsColors } from "./SettingsScreen.styles";
import {
  useSettingsPreferences,
  type SettingsProfile,
} from "./SettingsPreferences";
import SettingsDialogs from "./SettingsDialogs";
import { IconButton, tap } from "../../ui/primitives";

export type SettingsScreenProps = {
  dark: boolean;
  onDarkChange: (value: boolean) => void;
  onIncoming: () => void;
  onProfileChange?: (profile: SettingsProfile) => void;
};

export default function SettingsScreen({
  dark,
  onDarkChange,
  onIncoming,
  onProfileChange,
}: SettingsScreenProps) {
  const settings = useSettingsPreferences(onProfileChange);
  const [page, setPage] = useState<"profile" | "settings">("profile");
  useEffect(() => {
    if (page !== "settings") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        setPage("profile");
        return true;
      },
    );
    return () => subscription.remove();
  }, [page]);
  const {
    preferences,
    ready,
    setSheet,
    picking,
    avatarFailed,
    setAvatarFailed,
    toggle,
    pickAvatar,
    editProfile,
  } = settings;
  const colors = settingsColors(dark);

  const icon = (
    name: React.ComponentProps<typeof Ionicons>["name"],
    size = 21,
  ) => <Ionicons name={name} size={size} color={colors.text} />;
  const section = (title: string) => (
    <Text style={[styles.section, { color: colors.muted }]}>{title}</Text>
  );
  function row(
    title: string,
    subtitle: string,
    symbol: React.ComponentProps<typeof Ionicons>["name"],
    action: () => void,
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          tap();
          action();
        }}
        style={({ pressed }) => [styles.row, { opacity: pressed ? 0.65 : 1 }]}
      >
        <View style={[styles.rowIcon, { backgroundColor: colors.tint }]}>
          {icon(symbol)}
        </View>
        <View style={styles.rowCopy}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
            {subtitle}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    );
  }
  function switchRow(
    title: string,
    subtitle: string,
    symbol: React.ComponentProps<typeof Ionicons>["name"],
    value: boolean,
    change: (value: boolean) => void,
    disabled = false,
  ) {
    return (
      <View style={styles.row}>
        <View style={[styles.rowIcon, { backgroundColor: colors.tint }]}>
          {icon(symbol)}
        </View>
        <View style={styles.rowCopy}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
            {subtitle}
          </Text>
        </View>
        <Switch
          accessibilityLabel={title}
          value={value}
          onValueChange={change}
          disabled={disabled}
          trackColor={{ false: dark ? "#50574E" : "#DEDfD5", true: CORAL }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={dark ? "#50574E" : "#DEDFD5"}
        />
      </View>
    );
  }
  const divider = (
    <View style={[styles.divider, { backgroundColor: colors.line }]} />
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        {page === "settings" && (
          <IconButton
            name="arrow-back"
            label="Back to My Profile"
            color={colors.text}
            onPress={() => setPage("profile")}
          />
        )}
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {page === "profile" ? "My Profile" : "Settings"}
        </Text>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {page === "profile" ? (
          <>
            <View style={[styles.profile, { backgroundColor: colors.card }]}>
              <Pressable
                accessibilityLabel="Change profile photo"
                accessibilityRole="button"
                disabled={!ready || picking}
                onPress={() => void pickAvatar()}
                style={styles.avatarWrap}
              >
                {avatarFailed ? (
                  <View
                    style={[
                      styles.avatar,
                      styles.avatarFallback,
                      { backgroundColor: colors.tint },
                    ]}
                  >
                    {icon("person-outline", 36)}
                  </View>
                ) : (
                  <Image
                    source={{ uri: preferences.avatar }}
                    style={styles.avatar}
                    onError={() => setAvatarFailed(true)}
                  />
                )}
                <View style={[styles.camera, { borderColor: colors.card }]}>
                  {picking ? (
                    <ActivityIndicator size="small" color="#29372F" />
                  ) : (
                    <Ionicons name="camera" size={15} color="#29372F" />
                  )}
                </View>
              </Pressable>
              <Text style={[styles.profileName, { color: colors.text }]}>
                {preferences.name}
              </Text>
              <Text style={[styles.bio, { color: colors.muted }]}>
                {preferences.username
                  ? `@${preferences.username}`
                  : "No username yet"}
              </Text>
              {!!preferences.bio && (
                <Text style={[styles.bio, { color: colors.muted }]}>
                  {preferences.bio}
                </Text>
              )}
              <Pressable
                accessibilityRole="button"
                disabled={!ready}
                onPress={editProfile}
                style={[
                  styles.edit,
                  { backgroundColor: colors.tint, opacity: ready ? 1 : 0.5 },
                ]}
              >
                <Ionicons
                  name="create-outline"
                  size={15}
                  color={dark ? "#F4AD97" : "#A6533C"}
                />
                <Text
                  style={[
                    styles.editText,
                    { color: dark ? "#F4AD97" : "#A6533C" },
                  ]}
                >
                  Edit profile
                </Text>
              </Pressable>
              {!ready && (
                <ActivityIndicator
                  style={styles.loader}
                  color={CORAL}
                  accessibilityLabel="Loading settings"
                />
              )}
            </View>
            {section("PROFILE DETAILS")}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              {row("Name", preferences.name, "person-outline", editProfile)}
              {divider}
              {row(
                "Username",
                preferences.username
                  ? `@${preferences.username}`
                  : "Add a username",
                "at-outline",
                editProfile,
              )}
              {divider}
              {row(
                "Bio",
                preferences.bio || "Add a bio",
                "document-text-outline",
                editProfile,
              )}
            </View>
            {section("PREFERENCES")}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              {row(
                "Settings",
                "Appearance, notifications and haptics",
                "settings-outline",
                () => setPage("settings"),
              )}
            </View>
          </>
        ) : (
          <>
            {section("APPEARANCE")}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              {switchRow(
                "Dark mode",
                dark ? "On" : "Off",
                "moon-outline",
                dark,
                onDarkChange,
              )}
            </View>
            {section("NOTIFICATIONS")}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              {switchRow(
                "Message sounds",
                "Saved demo preference. No sounds play yet.",
                "musical-notes-outline",
                preferences.sound,
                (value) => toggle("sound", value),
                !ready,
              )}
              {divider}
              {switchRow(
                "Message previews",
                "Saved demo preference. No push previews yet.",
                "chatbubble-ellipses-outline",
                preferences.previews,
                (value) => toggle("previews", value),
                !ready,
              )}
            </View>
            <Text style={[styles.note, { color: colors.muted }]}>
              Demo preferences are saved on this device only. These switches do
              not enable notification sounds, push notifications, or message
              previews yet.
            </Text>
            {section("FEEDBACK")}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              {switchRow(
                "Haptics",
                "Touch feedback for app actions",
                "phone-portrait-outline",
                preferences.haptics,
                (value) => toggle("haptics", value),
                !ready,
              )}
            </View>
            {section("INFORMATION")}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              {row(
                "Privacy",
                "Storage and data use",
                "shield-checkmark-outline",
                () => setSheet("privacy"),
              )}
              {divider}
              {row(
                "About",
                "App and demo details",
                "information-circle-outline",
                () => setSheet("info"),
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={onIncoming}
              style={({ pressed }) => [
                styles.call,
                { backgroundColor: colors.tint, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={styles.callIcon}>
                <Ionicons name="call-outline" size={24} color="#29372F" />
              </View>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  Try an incoming call
                </Text>
                <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
                  Simulated call
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={22} color={colors.text} />
            </Pressable>
          </>
        )}
      </ScrollView>
      <SettingsDialogs settings={settings} colors={colors} />
    </View>
  );
}
