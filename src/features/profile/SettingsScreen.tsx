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
import Ionicons from "@expo/vector-icons/Ionicons";
import { CORAL, styles, settingsColors } from "./SettingsScreen.styles";
import {
  useSettingsPreferences,
  type ProfileChangeHandler,
} from "./SettingsPreferences";
import SettingsDialogs from "./SettingsDialogs";
import { IconButton, tap } from "../../ui/primitives";
import { useNotificationSettings } from "../../notifications/useNotificationSettings";
import type { ThemePreference } from "../../ui/theme";
import type { AppUpdater } from "../../state/useAppUpdater";
import UpdateSection from "./UpdateSection";
import AccountSection from "./AccountSection";

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export type SettingsScreenProps = {
  dark: boolean;
  theme: ThemePreference;
  onThemeChange: (value: ThemePreference) => void;
  onIncoming: () => void;
  onProfileChange?: ProfileChangeHandler;
  /** The app-wide updater, so the card and the launch prompt share one state. */
  updates: AppUpdater;
};

export default function SettingsScreen({
  dark,
  theme,
  onThemeChange,
  onIncoming,
  onProfileChange,
  updates,
}: SettingsScreenProps) {
  const settings = useSettingsPreferences(onProfileChange);
  const notifications = useNotificationSettings();
  const channels = notifications.status?.channels ?? {
    incoming: true,
    calls: true,
    messages: true,
  };
  const status = notifications.status ?? {
    permissionGranted: false,
    notificationsEnabled: false,
    channels,
  };
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
  const themeNote =
    theme === "system"
      ? `Following your device, ${dark ? "dark" : "light"} right now`
      : theme === "dark"
        ? "Always dark"
        : "Always light";

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
      {page === "settings" && (
        <View style={styles.header}>
          <IconButton
            name="arrow-back"
            label="Back to My Profile"
            color={colors.text}
            onPress={() => setPage("profile")}
          />
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Settings
          </Text>
        </View>
      )}
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
            <AccountSection colors={colors} />
            {section("APPEARANCE")}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.row}>
                <View style={[styles.rowIcon, { backgroundColor: colors.tint }]}>
                  {icon("contrast-outline")}
                </View>
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    Theme
                  </Text>
                  <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
                    {themeNote}
                  </Text>
                </View>
              </View>
              <View style={[styles.segment, { backgroundColor: colors.input }]}>
                {THEMES.map((option) => {
                  const active = theme === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        tap();
                        onThemeChange(option.value);
                      }}
                      style={[
                        styles.segmentOption,
                        active && styles.segmentActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          { color: active ? "#29372F" : colors.muted },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {section("NOTIFICATIONS")}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              {switchRow(
                "System notifications",
                notifications.available
                  ? status.permissionGranted
                    ? "Calls and messages can appear outside the app"
                    : "Android permission is not granted yet"
                  : "Requires the Android app build",
                "notifications-outline",
                preferences.systemNotifications,
                (value) => toggle("systemNotifications", value),
                !ready || !notifications.available,
              )}
              {divider}
              {row(
                "Android permission",
                status.permissionGranted ? "Allowed" : "Not allowed",
                "shield-checkmark-outline",
                () => {
                  if (notifications.available && !status.permissionGranted)
                    void notifications.request();
                  else notifications.openChannel();
                },
              )}
              {divider}
              {row(
                "Call notifications",
                channels.incoming && channels.calls
                  ? "Ringing and ongoing calls"
                  : "Some call channels are off",
                "call-outline",
                () => notifications.openChannel("incoming"),
              )}
              {divider}
              {row(
                "Message notifications",
                channels.messages ? "With reply, read and mute" : "Channel is off",
                "chatbubble-ellipses-outline",
                () => notifications.openChannel("messages"),
              )}
              {divider}
              {switchRow(
                "Message previews",
                "Show message text in notifications",
                "chatbubble-outline",
                preferences.previews,
                (value) => toggle("previews", value),
                !ready,
              )}
              {divider}
              {switchRow(
                "Message sounds",
                "Play a sound for new messages",
                "musical-notes-outline",
                preferences.sound,
                (value) => toggle("sound", value),
                !ready,
              )}
            </View>
            <Text style={[styles.note, { color: colors.muted }]}>
              Android owns notification permissions and channel settings. The
              permission row opens the system screen when it is blocked. Call
              actions answer or decline; message actions reply, mark read, or
              mute without opening the app.
            </Text>
            {section("UPDATES")}
            <UpdateSection updates={updates} colors={colors} />
            <Text style={[styles.note, { color: colors.muted }]}>
              Updates download from this app's release feed and are checked
              against their published checksum. Android confirms the install,
              which replaces the app in place and keeps your chats and settings.
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
