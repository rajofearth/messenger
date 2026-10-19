/**
 * The Updates card in Settings.
 *
 * It reports the same state the launch prompt acts on, and offers the same
 * next step, so a user who dismissed the prompt can still finish the install
 * without waiting for the next launch.
 */

import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { formatBytes } from "../../domain/updates";
import type { AppUpdater } from "../../state/useAppUpdater";
import { tap, type IconName } from "../../ui/primitives";
import { styles, type SettingsColors } from "./SettingsScreen.styles";

export default function UpdateSection({
  updates,
  colors,
}: {
  updates: AppUpdater;
  colors: SettingsColors;
}) {
  const { status, manifest, download, progress, installed } = updates;
  const size = updates.size ?? (manifest ? formatBytes(manifest.apkBytes) : "");
  const percent =
    progress && progress.total > 0
      ? Math.min(1, progress.done / progress.total)
      : null;

  function summary(): string {
    const version = installed ? `Version ${installed.versionName}` : "This build";
    switch (status) {
      case "unsupported":
        return "Requires the Android app build";
      case "unconfigured":
        return "This build has no update feed";
      case "checking":
        return `${version} · checking for a new version`;
      case "unknown":
        return `${version} · could not check for updates`;
      case "current":
        return `${version} · up to date`;
      case "available":
        break;
    }
    if (download.stage === "downloading") {
      return percent === null
        ? `Downloading… ${formatBytes(progress?.done ?? 0)}`
        : `Downloading… ${Math.round(percent * 100)}% of ${size}`;
    }
    if (download.stage === "ready") return `${version} · update downloaded and verified`;
    if (download.stage === "installing") return "Waiting for Android's installer";
    if (download.stage === "failed") {
      return download.message ?? "The update could not be downloaded";
    }
    return `${version} · ${manifest ? `version ${manifest.versionName} is available (${size})` : "an update is available"}`;
  }

  function action(
    title: string,
    subtitle: string,
    symbol: IconName,
    run: () => void,
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          tap();
          run();
        }}
        style={({ pressed }) => [styles.row, { opacity: pressed ? 0.65 : 1 }]}
      >
        <View style={[styles.rowIcon, { backgroundColor: colors.tint }]}>
          <Ionicons name={symbol} size={21} color={colors.text} />
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

  const busy =
    status === "checking" ||
    download.stage === "downloading" ||
    download.stage === "installing";

  function nextStep() {
    if (status === "available" && download.stage === "idle") {
      if (!updates.canInstall) {
        return action(
          "Allow installs",
          "Android must trust the app to install its updates",
          "lock-open-outline",
          updates.openInstallSettings,
        );
      }
      return action(
        "Download update",
        `${size} · verified before it is installed`,
        "arrow-down-circle-outline",
        () => void updates.startDownload(),
      );
    }
    if (download.stage === "downloading") {
      return action(
        "Cancel download",
        "Keeps the version you are running",
        "close-circle-outline",
        updates.stopDownload,
      );
    }
    if (download.stage === "ready") {
      return updates.canInstall
        ? action(
            "Install update",
            "Android asks for confirmation and keeps your data",
            "checkmark-circle-outline",
            () => void updates.install(),
          )
        : action(
            "Allow installs",
            "Android must trust the app to install its updates",
            "lock-open-outline",
            updates.openInstallSettings,
          );
    }
    if (download.stage === "failed") {
      return updates.canInstall
        ? action(
            "Try again",
            "Restarts the download",
            "refresh-outline",
            () => void updates.startDownload(),
          )
        : action(
            "Allow installs",
            "Android must trust the app to install its updates",
            "lock-open-outline",
            updates.openInstallSettings,
          );
    }
    if (status === "current" || status === "unknown") {
      return action(
        "Check for updates",
        "Asks the release feed once",
        "refresh-outline",
        () => void updates.checkNow(),
      );
    }
    return null;
  }

  const step = nextStep();
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.row}>
        <View style={[styles.rowIcon, { backgroundColor: colors.tint }]}>
          <Ionicons name="cloud-download-outline" size={21} color={colors.text} />
        </View>
        <View style={styles.rowCopy}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>Updates</Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
            {summary()}
          </Text>
        </View>
        {busy ? <ActivityIndicator size="small" color={colors.muted} /> : null}
      </View>
      {step ? (
        <>
          <View style={[styles.divider, { backgroundColor: colors.line }]} />
          {step}
        </>
      ) : null}
    </View>
  );
}
