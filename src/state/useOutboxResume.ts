import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { retryableOutbox } from "../domain/outbox";
import { convexClient } from "../services/convexClient";
import {
  outboxLoaded,
  outboxSnapshot,
  sweepOutboxFiles,
} from "../services/outbox";
import type { RetryMessage } from "./remoteMessengerSend";

const RETRY_LIMIT = 3;
const RETRY_INTERVAL_MS = 30_000;

/**
 * Resumes unsent outbox rows once the local cache is ready: immediately, when
 * the app returns to the foreground, when the Convex socket reconnects, and
 * every 30 seconds while it stays active. Automatic attempts are capped per
 * message so a permanent failure (file too large, source gone) does not retry
 * forever; a reconnect starts a fresh set, and the bubble's manual retry is
 * unlimited. `findMessage` searches every chat, so a row resumes even when its
 * conversation is not open.
 */
export function useOutboxResume(
  localReady: boolean,
  retryMessage: RetryMessage,
) {
  const retry = useRef(retryMessage);
  const attempts = useRef(new Map<string, number>());

  // Point the ref at the latest committed callback only. Writing it during
  // render could select a closure from a render React discards, whose fresh
  // in-flight set would miss the committed callback's retries.
  useEffect(() => {
    retry.current = retryMessage;
  });

  useEffect(() => {
    if (!localReady) return;
    const attempt = () => {
      for (const record of retryableOutbox(outboxSnapshot())) {
        const id = record.message.id;
        if ((attempts.current.get(id) ?? 0) >= RETRY_LIMIT) continue;
        if (retry.current(id, { silent: true })) {
          attempts.current.set(id, (attempts.current.get(id) ?? 0) + 1);
        }
      }
    };
    attempt();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (outboxLoaded()) sweepOutboxFiles();
        attempt();
      }
    });
    // A reconnect is the clearest signal that a network failure is over, so
    // give the queue a fresh set of attempts instead of waiting for a relaunch.
    let connected = convexClient.connectionState().isWebSocketConnected;
    const unsubscribe = convexClient.subscribeToConnectionState((state) => {
      if (state.isWebSocketConnected && !connected) {
        attempts.current.clear();
        attempt();
      }
      connected = state.isWebSocketConnected;
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active") attempt();
    }, RETRY_INTERVAL_MS);
    return () => {
      subscription.remove();
      unsubscribe();
      clearInterval(timer);
    };
  }, [localReady]);
}
