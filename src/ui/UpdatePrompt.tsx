/**
 * The launch prompt for an available release.
 *
 * It is shown over the chat list, never over a call, a story, or a dialog, so
 * the nudge cannot interrupt something the user is in the middle of. The card
 * only offers what the platform can actually do next: allow installs, download,
 * or hand a verified file to Android's installer.
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { formatBytes } from "../domain/updates";
import type { AppUpdater } from "../state/useAppUpdater";
import { palette, coral, onCoral } from "./theme";
import { tap } from "./primitives";

export default function UpdatePrompt({
  updates,
  dark,
  visible,
}: {
  updates: AppUpdater;
  dark: boolean;
  visible: boolean;
}) {
  const colors = palette(dark);
  const { manifest, progress, download, dismissible } = updates;
  const showing = visible && updates.promptVisible;
  const [notesExpanded, setNotesExpanded] = useState(true);

  useEffect(() => {
    setNotesExpanded(true);
  }, [showing, manifest?.versionCode]);

  // A forced update has no way back: Android's back gesture must not hide the
  // only screen that can install it. The modal's onRequestClose is the usual
  // path; this listener also covers devices that dispatch the event directly.
  useEffect(() => {
    if (!showing || dismissible) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true,
    );
    return () => subscription.remove();
  }, [showing, dismissible]);

  if (!showing || !manifest) return null;

  const percent =
    progress && progress.total > 0
      ? Math.min(1, progress.done / progress.total)
      : null;
  const size = updates.size ?? formatBytes(manifest.apkBytes);
  const installed = updates.installed?.versionName;
  const title = updates.forced ? "Update required" : "Update available";

  const primary = (
    label: string,
    action: () => void,
    disabled = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => {
        tap();
        action();
      }}
      style={({ pressed }) => [
        s.primary,
        { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={s.primaryText}>{label}</Text>
    </Pressable>
  );

  const secondary = (label: string, action: () => void) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        action();
      }}
      style={({ pressed }) => [
        s.secondary,
        { borderColor: colors.line, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[s.secondaryText, { color: colors.muted }]}>{label}</Text>
    </Pressable>
  );

  const later = dismissible ? secondary("Later", updates.dismiss) : null;

  function actions() {
    if (download.stage === "downloading") {
      return (
        <>
          <View style={[s.track, { backgroundColor: colors.line }]}>
            <View
              style={[
                s.fill,
                {
                  backgroundColor: colors.coralInk,
                  width: `${Math.round((percent ?? 0) * 100)}%`,
                },
              ]}
            />
          </View>
          <Text
            accessibilityLiveRegion="polite"
            style={[s.progress, { color: colors.muted }]}
          >
            {percent === null
              ? `Downloading… ${formatBytes(progress?.done ?? 0)}`
              : `Downloading… ${Math.round(percent * 100)}% of ${size}`}
          </Text>
          {secondary("Cancel download", updates.stopDownload)}
        </>
      );
    }
    if (download.stage === "ready" && !updates.canInstall) {
      return (
        <>
          <Text style={[s.hint, { color: colors.muted }]}>
            Android needs your permission before it can install the update.
          </Text>
          {primary("Allow installs", updates.openInstallSettings)}
          {later}
        </>
      );
    }
    if (download.stage === "ready") {
      return (
        <>
          <Text style={[s.hint, { color: colors.muted }]}>
            Downloaded and verified ({size}). Android will ask you to confirm,
            and your chats and settings stay in place.
          </Text>
          {primary("Install update", () => void updates.install())}
          {later}
        </>
      );
    }
    if (download.stage === "installing") {
      return (
        <>
          <ActivityIndicator color={colors.coralInk} style={s.spinner} />
          <Text style={[s.hint, { color: colors.muted }]}>
            Finish in Android's installer. The app reopens on the new version.
          </Text>
          {dismissible ? secondary("Close", updates.dismiss) : null}
        </>
      );
    }
    if (download.stage === "failed") {
      return (
        <>
          <Text style={[s.error, { color: colors.muted }]}>
            {download.message ?? "The update could not be downloaded."}
          </Text>
          {!updates.canInstall
            ? primary("Allow installs", updates.openInstallSettings)
            : primary("Try again", () => void updates.startDownload())}
          {later}
        </>
      );
    }
    return (
      <>
        {!updates.canInstall ? (
          <Text style={[s.hint, { color: colors.muted }]}>
            Android needs your permission before it can install the update.
          </Text>
        ) : null}
        {primary(
          updates.canInstall ? `Download (${size})` : "Allow installs",
          updates.canInstall
            ? () => void updates.startDownload()
            : updates.openInstallSettings,
        )}
        {later}
      </>
    );
  }

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (dismissible) updates.dismiss();
      }}
    >
      <SafeAreaView style={s.overlay}>
        <View
          accessibilityViewIsModal
          style={[s.card, { backgroundColor: colors.card }]}
        >
          <ScrollView style={s.content} contentContainerStyle={s.contentContainer}>
            <View style={s.header}>
              <View style={[s.symbol, { backgroundColor: colors.tint }]}>
                <Ionicons name="cloud-download-outline" size={22} color={colors.fg} />
              </View>
              <Text style={[s.title, { color: colors.fg }]}>{title}</Text>
            </View>
            <Text style={[s.body, { color: colors.muted }]}>
              Version {manifest.versionName} · {size}
            </Text>
            {updates.forced ? (
              <Text style={[s.hint, { color: colors.muted }]}>
                Install this update to keep using Messenger. Your chats and settings stay in place.
              </Text>
            ) : null}
            {manifest.notes ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="What's new"
                  accessibilityState={{ expanded: notesExpanded }}
                  onPress={() => setNotesExpanded((expanded) => !expanded)}
                  style={s.notesToggle}
                >
                  <Text style={[s.notesLabel, { color: colors.fg }]}>What's new</Text>
                  <Ionicons name={notesExpanded ? "chevron-up" : "chevron-down"} size={16} color={colors.muted} />
                </Pressable>
                {notesExpanded ? (
                  <ScrollView nestedScrollEnabled style={s.notes}>
                    {installed ? <Text style={[s.hint, { color: colors.muted }]}>Installed: {installed}</Text> : null}
                    <Text style={[s.body, { color: colors.muted }]}>{manifest.notes}</Text>
                  </ScrollView>
                ) : null}
              </>
            ) : null}
            {actions()}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(16,25,20,0.55)",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  card: {
    borderRadius: 22,
    width: "100%",
    maxWidth: 400,
    maxHeight: "100%",
    alignSelf: "center",
    overflow: "hidden",
  },
  content: { flexGrow: 0, flexShrink: 1 },
  contentContainer: { padding: 20 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  symbol: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontFamily: "DMSans_700Bold",
    fontSize: 20,
    letterSpacing: -0.4,
  },
  body: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  notesToggle: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  notesLabel: { fontFamily: "DMSans_500Medium", fontSize: 13 },
  notes: { maxHeight: 180, marginBottom: 8 },
  hint: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    lineHeight: 19,
    marginBottom: 14,
  },
  error: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 6,
  },
  fill: { height: "100%", borderRadius: 3 },
  progress: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    marginTop: 9,
    marginBottom: 18,
  },
  spinner: { marginBottom: 14 },
  primary: {
    backgroundColor: coral,
    borderRadius: 16,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  primaryText: { fontFamily: "DMSans_700Bold", color: onCoral, fontSize: 14 },
  secondary: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    minHeight: 40,
    marginTop: 4,
  },
  secondaryText: { fontFamily: "DMSans_500Medium", fontSize: 13 },
});
