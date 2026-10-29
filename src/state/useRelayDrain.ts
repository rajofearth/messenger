import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { drainRelay } from "../services/relayDrain";

/** Foreground-only; bounds how long a peer's message waits without a wake. */
const ACTIVE_DRAIN_MS = 20_000;

/**
 * Pulls queued relay envelopes into the phone copy while the app is open. A
 * drain runs when the app becomes ready, each time it returns to the foreground,
 * and on a slow timer while it is visible: a wake is only a hint, and the relay
 * has no live subscription, so a peer's message would otherwise sit unseen until
 * the app was backgrounded and reopened. The drain writes SQLite itself, so this
 * only hands the changed conversation ids back to the cache.
 */
export function useRelayDrain({
  enabled,
  selfId,
  onSync,
}: {
  enabled: boolean;
  selfId?: string;
  onSync: (chatIds: string[]) => void;
}): void {
  const sync = useRef(onSync);
  const draining = useRef(false);

  useEffect(() => {
    sync.current = onSync;
  });

  useEffect(() => {
    if (!enabled || !selfId) return;
    let active = true;
    let visible = AppState.currentState === "active";

    const run = async () => {
      if (draining.current) return;
      draining.current = true;
      try {
        const chatIds = await drainRelay(selfId);
        if (active && chatIds.length) sync.current(chatIds);
      } catch {
        // A failed drain retries on the next foreground or tick; the queue is safe.
      } finally {
        draining.current = false;
      }
    };

    void run();
    const timer = setInterval(() => {
      if (visible) void run();
    }, ACTIVE_DRAIN_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      visible = state === "active";
      if (visible) void run();
    });
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [enabled, selfId]);
}
