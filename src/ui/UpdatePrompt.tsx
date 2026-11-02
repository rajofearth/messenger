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
import { palette, radius, space } from "./theme";
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
  const base = palette(dark);
  const colors = {
    ...base,
    bg: dark ? "#111111" : "#FFFFFF",
    fg: dark ? "#F5F5F5" : "#111111",
    muted: dark ? "#A6A6A6" : "#6B6B6B",
    card: dark ? "#171717" : "#FFFFFF",
    line: dark ? "#2A2A2A" : "#E8E8E8",
    tint: dark ? "#242424" : "#F4F4F4",
    scrim: dark ? "rgba(0,0,0,0.72)" : "rgba(0,0,0,0.45)",
    coralInk: dark ? "#F5F5F5" : "#111111",
    switchTrackOn: dark ? "#F5F5F5" : "#111111",
    onCoral: dark ? "#111111" : "#FFFFFF",
  };
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
    hint?: string,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        tap();
        action();
      }}
      style={({ pressed }) => [
        s.primary,
        {
          backgroundColor: colors.switchTrackOn,
          opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text style={[s.primaryText, { color: colors.onCoral }]}>{label}</Text>
    </Pressable>
  );

  const secondary = (label: string, action: () => void, hint?: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
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

  const later = dismissible
    ? secondary("Later", updates.dismiss, "Keep using this version")
    : null;

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
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Update download progress"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: percent === null ? undefined : Math.round(percent * 100),
              text:
                percent === null
                  ? formatBytes(progress?.done ?? 0)
                  : `${Math.round(percent * 100)}%`,
            }}
          >
            <Text
              accessibilityLiveRegion="polite"
              style={[s.progress, { color: colors.muted }]}
            >
              {percent === null
                ? `Downloading… ${formatBytes(progress?.done ?? 0)}`
                : `Downloading… ${Math.round(percent * 100)}% of ${size}`}
            </Text>
          </View>
          {secondary("Cancel download", updates.stopDownload, "Keep using this version")}
        </>
      );
    }
    if (download.stage === "ready" && !updates.canInstall) {
      return (
        <>
          <Text style={[s.hint, { color: colors.muted }]}>
            The update is downloaded and verified. Allow installs in Android
            settings, then return here to install it.
          </Text>
          {primary("Allow installs", updates.openInstallSettings, false, "Open Android settings")}
          {later}
        </>
      );
    }
    if (download.stage === "ready") {
      return (
        <>
          <Text style={[s.hint, { color: colors.muted }]}>
            Downloaded and verified ({size}). Android will ask you to confirm;
            your chats and settings stay in place.
          </Text>
          {primary("Install update", () => void updates.install(), false, "Open Android's installer")}
          {later}
        </>
      );
    }
    if (download.stage === "installing") {
      return (
        <>
          <ActivityIndicator
            accessibilityLabel="Waiting for Android's installer"
            color={colors.coralInk}
            style={s.spinner}
          />
          <Text style={[s.hint, { color: colors.muted }]}>
            Finish in Android's installer. The app reopens on the new version.
          </Text>
          {dismissible
            ? secondary("Close", updates.dismiss, "Return to Messenger")
            : null}
        </>
      );
    }
    if (download.stage === "failed") {
      const hasVerifiedFile = Boolean(download.path);
      return (
        <>
          <Text accessibilityRole="alert" style={[s.error, { color: colors.danger }]}>
            {download.message ?? "The update could not be completed."}
          </Text>
          {hasVerifiedFile && !updates.canInstall
            ? primary("Allow installs", updates.openInstallSettings, false, "Open Android settings")
            : hasVerifiedFile
              ? primary("Try install again", () => void updates.install(), false, "Open Android's installer")
              : primary("Try again", () => void updates.startDownload(), false, "Retry the download")}
          {hasVerifiedFile && !updates.canInstall
            ? secondary("Download again", () => void updates.startDownload(), "Replace the verified download")
            : null}
          {later}
        </>
      );
    }
    return (
      <>
        {!updates.canInstall ? (
          <Text style={[s.hint, { color: colors.muted }]}>
            Android needs your permission before it can install updates. You
            can grant it in settings before downloading.
          </Text>
        ) : null}
        {primary(
          updates.canInstall ? `Download (${size})` : "Allow installs",
          updates.canInstall
            ? () => void updates.startDownload()
            : updates.openInstallSettings,
          false,
          updates.canInstall
            ? "Download and verify this release"
            : "Open Android settings",
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
      <SafeAreaView style={[s.overlay, { backgroundColor: colors.scrim }]}>
        <View
          accessibilityViewIsModal
          accessibilityLabel={title}
          style={[s.card, { backgroundColor: colors.card }]}
        >
          <ScrollView
            style={s.content}
            contentContainerStyle={s.contentContainer}
          >
            <View style={s.header}>
              <View style={[s.symbol, { backgroundColor: colors.tint }]}>
                <Ionicons
                  name="cloud-download-outline"
                  size={22}
                  color={colors.fg}
                />
              </View>
              <Text style={[s.title, { color: colors.fg }]}>{title}</Text>
            </View>
            <Text style={[s.body, { color: colors.muted }]}>
              Version {manifest.versionName} · {size}
            </Text>
            {updates.forced ? (
              <Text style={[s.hint, { color: colors.muted }]}>
                Install this update to keep using Messenger. Your chats and
                settings stay in place.
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
                  <Text style={[s.notesLabel, { color: colors.fg }]}>
                    What's new
                  </Text>
                  <Ionicons
                    name={notesExpanded ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.muted}
                  />
                </Pressable>
                {notesExpanded ? (
                  <ScrollView nestedScrollEnabled style={s.notes}>
                    {installed ? (
                      <Text style={[s.hint, { color: colors.muted }]}>
                        Installed: {installed}
                      </Text>
                    ) : null}
                    <Text style={[s.body, { color: colors.muted }]}>
                      {manifest.notes}
                    </Text>
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
    backgroundColor: "transparent",
    justifyContent: "center",
    paddingHorizontal: space.xl,
    paddingVertical: space.xxl,
  },
  card: {
    borderRadius: radius.control,
    width: "100%",
    maxWidth: 400,
    maxHeight: "100%",
    alignSelf: "center",
    overflow: "hidden",
  },
  content: { flexGrow: 0, flexShrink: 1 },
  contentContainer: { padding: space.xl },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginBottom: space.md,
  },
  symbol: {
    width: 40,
    height: 40,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "600",
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: space.sm,
  },
  notesToggle: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
  notesLabel: { fontSize: 13, fontWeight: "600" },
  notes: { maxHeight: 180, marginBottom: space.sm },
  hint: {
    fontSize: 12,
    lineHeight: 19,
    marginBottom: space.md,
  },
  error: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: space.lg,
  },
  track: {
    height: space.xs,
    borderRadius: radius.pill,
    overflow: "hidden",
    marginTop: space.sm,
  },
  fill: { height: "100%", borderRadius: radius.pill },
  progress: {
    fontSize: 12,
    marginTop: space.sm,
    marginBottom: space.lg,
  },
  spinner: { marginBottom: space.md },
  primary: {
    borderRadius: radius.control,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.sm,
  },
  primaryText: { fontSize: 14, fontWeight: "600" },
  secondary: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    minHeight: 40,
    marginTop: space.xs,
  },
  secondaryText: { fontSize: 13, fontWeight: "600" },
});
