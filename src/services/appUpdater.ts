/**
 * The app updater bridge, and the only file that knows the native module's
 * shape. Everything above it works with the typed functions below.
 *
 * The native module installs nothing on its own: it reports whether Android
 * would allow an install, downloads and verifies a release APK, and hands the
 * file to the system package installer, which still asks the user.
 */

import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export type AppUpdateStatus = {
  versionName: string;
  versionCode: number;
  /** False once Android's per-app "install unknown apps" switch is off. */
  canInstall: boolean;
  /** Bytes of a previously downloaded release still in the cache. */
  cachedBytes: number;
};

export type DownloadResult = {
  path: string;
  bytes: number;
  /** True when an earlier download already matched the digest. */
  reused: boolean;
};

export type DownloadProgress = {
  downloadedBytes: number;
  totalBytes: number;
};

type Subscription = { remove(): void };

interface AppUpdaterNative {
  getStatus(): Promise<AppUpdateStatus>;
  downloadApk(url: string, sha256: string): Promise<DownloadResult>;
  cancelDownload(): Promise<boolean>;
  clearDownloads(): Promise<{ deleted: number }>;
  installApk(path: string): Promise<{ started: boolean }>;
  openInstallPermissionSettings(): Promise<void>;
  openAppSettings(): Promise<void>;
  addListener(
    event: "onDownloadProgress",
    listener: (progress: DownloadProgress) => void,
  ): Subscription;
}

const native =
  Platform.OS === "android"
    ? requireOptionalNativeModule<AppUpdaterNative>("AppUpdater")
    : null;

function bridge(): AppUpdaterNative {
  if (!native) {
    throw new Error(
      "AppUpdater requires an Android development/native build. It is not available in Expo Go or on iOS/web.",
    );
  }
  return native;
}

export const isAppUpdaterAvailable = native !== null;

export const getStatus = (): Promise<AppUpdateStatus> => bridge().getStatus();

/** Downloads and verifies the digest natively; failures carry a stable code. */
export const downloadApk = (url: string, sha256: string): Promise<DownloadResult> =>
  bridge().downloadApk(url, sha256);

export const cancelDownload = (): Promise<boolean> => bridge().cancelDownload();

/** Removes cached release APKs, e.g. once the installed build caught up. */
export const clearDownloads = (): Promise<{ deleted: number }> =>
  bridge().clearDownloads();

/** Opens Android's installer. The user still confirms the install there. */
export const installApk = (path: string): Promise<{ started: boolean }> =>
  bridge().installApk(path);

export const openInstallPermissionSettings = (): Promise<void> =>
  bridge().openInstallPermissionSettings();

export const openAppSettings = (): Promise<void> => bridge().openAppSettings();

export function subscribeToProgress(
  listener: (progress: DownloadProgress) => void,
): Subscription {
  return bridge().addListener("onDownloadProgress", listener);
}

/** Native rejections carry a stable code; anything else is an unknown failure. */
export function updateErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "ERR_UPDATE_UNKNOWN";
}

export function updateErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "The update could not be downloaded.";
}
