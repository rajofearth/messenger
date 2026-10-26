/**
 * The update lifecycle, shared by the launch prompt and the settings card.
 *
 * There is one instance per app run (owned by `App.tsx`) because a download is
 * native state: two hooks would fight over the same file and the second
 * download would be rejected as busy.
 *
 * Nothing here guesses. Whether an update exists comes from the release feed,
 * whether it is still pending comes from the installed version code that
 * Android reports, and how far the download got comes from the real byte
 * counts the native side emits.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  canDismiss,
  decideUpdate,
  shouldPrompt,
  type UpdateDecision,
  type UpdateManifest,
} from "../domain/updates";
import { fetchUpdateFeed, isUpdateFeedConfigured } from "../data/updateFeed";
import { messengerRepository } from "../data/messengerRepository";
import {
  cancelDownload,
  clearDownloads,
  downloadApk,
  getStatus,
  installApk,
  isAppUpdaterAvailable,
  openAppSettings,
  openInstallPermissionSettings,
  subscribeToProgress,
  updateErrorCode,
  updateErrorMessage,
  type AppUpdateStatus,
} from "../services/appUpdater";

export type UpdateCheck =
  | "unsupported"
  | "unconfigured"
  | "checking"
  | "unknown"
  | "current"
  | "available";

export type DownloadStage = "idle" | "downloading" | "ready" | "installing" | "failed";

type DownloadState = {
  stage: DownloadStage;
  /** Set once a verified file is on disk, and kept through a failed install. */
  path: string | null;
  message: string | null;
  /** The digest already matched a cached file, so no bytes were downloaded. */
  reused: boolean;
};

const IDLE_DOWNLOAD: DownloadState = {
  stage: "idle",
  path: null,
  message: null,
  reused: false,
};

export function useAppUpdater() {
  const supported = isAppUpdaterAvailable;
  const configured = isUpdateFeedConfigured;
  const [installed, setInstalled] = useState<AppUpdateStatus | null>(null);
  const [decision, setDecision] = useState<UpdateDecision>({ status: "unknown" });
  const [checking, setChecking] = useState(false);
  const [download, setDownload] = useState<DownloadState>(IDLE_DOWNLOAD);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [hiddenNow, setHiddenNow] = useState(false);

  // Callbacks read the newest values through refs, so their own identity stays
  // stable. An unstable callback would re-run the mount effect and re-fetch
  // the feed on every progress event.
  const latest = useRef({ decision, download });
  latest.current = { decision, download };
  const installedRef = useRef<AppUpdateStatus | null>(null);
  const checkingRef = useRef(false);
  // A second tap must not hit the native single-flight guard: that path rejects
  // with "busy" and would replace the live progress with a failure message
  // while the first download keeps running.
  const startingRef = useRef(false);

  const applyStatus = useCallback((status: AppUpdateStatus) => {
    installedRef.current = status;
    setInstalled(status);
  }, []);

  /** Re-reads the installed version; Android is the authority on it. */
  const refreshInstalled = useCallback(async () => {
    if (!supported) return;
    const status = await getStatus().catch(() => null);
    if (!status) {
      // A failed status read must not leave the prompt spinning in
      // "installing" forever; the cached package is still there to retry.
      setDownload((current) =>
        current.stage === "installing" ? { ...current, stage: "ready" } : current,
      );
      return;
    }
    applyStatus(status);
    const pending = latest.current.decision;
    if (pending.status === "available" && status.versionCode >= pending.manifest.versionCode) {
      // The installer replaced the app while it was in the background, so the
      // cached APK is dead weight and the release is no longer pending.
      setDecision({ status: "current" });
      setDownload(IDLE_DOWNLOAD);
      void clearDownloads().catch(() => {});
      return;
    }
    if (latest.current.download.stage === "ready" && status.cachedBytes <= 0) {
      // The download vanished (cache pressure, another cleanup): offer it again.
      setDownload(IDLE_DOWNLOAD);
    }
    // Returning from the installer without installing must allow a retry.
    setDownload((current) =>
      current.stage === "installing" ? { ...current, stage: "ready" } : current,
    );
  }, [supported, applyStatus]);

  const checkFeed = useCallback(async () => {
    if (!supported || !configured || checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const status = installedRef.current ?? (await getStatus().catch(() => null));
      if (!status) {
        setDecision({ status: "unknown" });
        return;
      }
      applyStatus(status);
      const feed = await fetchUpdateFeed(status.versionCode);
      if (feed.status === "failed") {
        // A flaky network must not withdraw a verified download.
        setDecision((current) =>
          current.status === "available"
            ? current
            : { status: "unknown" },
        );
        return;
      }
      const next = decideUpdate(feed, status);
      setDecision(next);
      if (next.status === "current" && status.cachedBytes > 0) {
        void clearDownloads().catch(() => {});
      }
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [supported, configured, applyStatus]);

  useEffect(() => {
    if (!supported) return;
    let active = true;
    void (async () => {
      const stored = await messengerRepository
        .loadDismissedRelease()
        .catch(() => undefined);
      const status = await getStatus().catch(() => null);
      if (!active) return;
      if (stored) setDismissed(stored.dismissedVersionCode);
      if (status) applyStatus(status);
      if (configured) await checkFeed();
    })();
    return () => {
      active = false;
    };
  }, [supported, configured, applyStatus, checkFeed]);

  useEffect(() => {
    if (!supported) return;
    const subscription = subscribeToProgress((update) =>
      setProgress({ done: update.downloadedBytes, total: update.totalBytes }),
    );
    return () => subscription.remove();
  }, [supported]);

  useEffect(() => {
    if (!supported) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshInstalled();
    });
    return () => subscription.remove();
  }, [supported, refreshInstalled]);

  const startDownload = useCallback(async () => {
    const current = latest.current.decision;
    if (!supported || current.status !== "available" || startingRef.current) return;
    startingRef.current = true;
    setHiddenNow(false);
    setProgress(null);
    setDownload({ ...IDLE_DOWNLOAD, stage: "downloading" });
    try {
      const result = await downloadApk(current.manifest.apkUrl, current.manifest.apkSha256);
      setDownload({
        stage: "ready",
        path: result.path,
        message: null,
        reused: result.reused,
      });
    } catch (error) {
      const cancelled = updateErrorCode(error) === "ERR_UPDATE_CANCEL";
      setDownload(
        cancelled
          ? IDLE_DOWNLOAD
          : {
              stage: "failed",
              path: null,
              message: updateErrorMessage(error),
              reused: false,
            },
      );
    } finally {
      startingRef.current = false;
      setProgress(null);
    }
  }, [supported]);

  const stopDownload = useCallback(() => {
    if (supported) void cancelDownload().catch(() => {});
  }, [supported]);

  const install = useCallback(async () => {
    const current = latest.current.download;
    if (!supported || current.stage !== "ready" || !current.path) return;
    setDownload({ ...current, stage: "installing", message: null });
    try {
      await installApk(current.path);
    } catch (error) {
      setDownload({
        stage: "failed",
        path: current.path,
        message: updateErrorMessage(error),
        reused: current.reused,
      });
    }
  }, [supported]);

  const openInstallSettings = useCallback(() => {
    if (supported) void openInstallPermissionSettings().catch(() => {});
  }, [supported]);

  const openSettings = useCallback(() => {
    if (supported) void openAppSettings().catch(() => {});
  }, [supported]);

  /** Dismissal is remembered per release, so the next one asks again. */
  const dismiss = useCallback(() => {
    const current = latest.current.decision;
    if (current.status !== "available" || !canDismiss(current)) return;
    setHiddenNow(true);
    setDismissed(current.manifest.versionCode);
    void messengerRepository
      .saveDismissedRelease({ dismissedVersionCode: current.manifest.versionCode })
      .catch(() => {});
  }, []);

  const manifest: UpdateManifest | null =
    decision.status === "available" ? decision.manifest : null;
  const status: UpdateCheck = !supported
    ? "unsupported"
    : !configured
      ? "unconfigured"
      : checking
        ? "checking"
        : decision.status;

  return {
    supported,
    configured,
    status,
    manifest,
    forced: decision.status === "available" && decision.forced,
    dismissible: canDismiss(decision),
    size: decision.status === "available" ? decision.size : null,
    installed,
    canInstall: installed?.canInstall ?? false,
    download,
    progress,
    promptVisible:
      decision.status === "available" && !hiddenNow && shouldPrompt(decision, dismissed),
    checkNow: checkFeed,
    startDownload,
    stopDownload,
    install,
    openInstallSettings,
    openSettings,
    dismiss,
  };
}

export type AppUpdater = ReturnType<typeof useAppUpdater>;
