/**
 * The launch prompt for an available release.
 *
 * It is shown over the chat list, never over a call, a story, or a dialog, so
 * the nudge cannot interrupt something the user is in the middle of. The card
 * only offers what the platform can actually do next: allow installs, download,
 * or hand a verified file to Android's installer.
 */

import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { formatBytes } from "../domain/updates";
import type { AppUpdater } from "../state/useAppUpdater";
import { palette, coral } from "./theme";
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
  const { manifest, progress, download } = updates;
  if (!visible || !updates.promptVisible || !manifest) return null;

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

  function actions() {
    if (download.stage === "downloading") {
      return (
        <>
          <View style={[s.track, { backgroundColor: colors.line }]}>
            <View
              style={[
                s.fill,
                {
                  backgroundColor: coral,
                  width: `${Math.round((percent ?? 0) * 100)}%`,
                },
              ]}
            />
          </View>
          <Text style={[s.progress, { color: colors.muted }]}>
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
          {secondary("Later", updates.dismiss)}
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
          {secondary("Later", updates.dismiss)}
        </>
      );
    }
    if (download.stage === "installing") {
      return (
        <>
          <ActivityIndicator color={coral} style={s.spinner} />
          <Text style={[s.hint, { color: colors.muted }]}>
            Finish in Android's installer. The app reopens on the new version.
          </Text>
          {secondary("Close", updates.dismiss)}
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
          {secondary("Later", updates.dismiss)}
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
        {secondary("Later", updates.dismiss)}
      </>
    );
  }

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={updates.dismiss}
    >
      <View style={s.overlay}>
        <View
          accessibilityViewIsModal
          style={[s.card, { backgroundColor: colors.card }]}
        >
          <View style={[s.symbol, { backgroundColor: colors.tint }]}>
            <Ionicons name="cloud-download-outline" size={28} color={colors.fg} />
          </View>
          <Text style={[s.title, { color: colors.fg }]}>{title}</Text>
          <Text style={[s.body, { color: colors.muted }]}>
            {installed
              ? `Version ${manifest.versionName} is available. You are on ${installed}.`
              : `Version ${manifest.versionName} is available.`}
          </Text>
          {manifest.notes ? (
            <Text style={[s.body, { color: colors.muted }]}>
              {manifest.notes}
            </Text>
          ) : null}
          {actions()}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(16,25,20,0.55)",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  card: {
    borderRadius: 28,
    padding: 24,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  symbol: {
    width: 58,
    height: 58,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: {
    fontFamily: "DMSans_700Bold",
    fontSize: 22,
    letterSpacing: -0.6,
    marginBottom: 8,
  },
  body: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
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
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  primaryText: { fontFamily: "DMSans_700Bold", color: "#29372F", fontSize: 14 },
  secondary: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 46,
    marginTop: 10,
  },
  secondaryText: { fontFamily: "DMSans_500Medium", fontSize: 13 },
});
