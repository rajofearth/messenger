/**
 * Delivers system notification actions to the app exactly once, in order.
 *
 * Subscribing happens before the pending snapshot is read, because native emits
 * live events while writing the queue. Overlapping events and snapshot entries
 * are deduplicated by action id, and an action is acknowledged only after the
 * handler resolves.
 */

import { useEffect, useRef } from "react";
import {
  isSystemNotificationsAvailable,
  getPendingActions,
  acknowledgeActions,
  subscribeToActions,
  type SystemNotificationAction,
} from "../services/systemNotifications";
import { actionLedger, type ActionLedger } from "./actionLedger";

export type ActionHandler = (
  action: SystemNotificationAction,
) => Promise<void> | void;

export function useNotificationBridge(
  onAction: ActionHandler,
  enabled = true,
  ledger: ActionLedger = actionLedger,
) {
  // Handlers close over current state, so keep the newest without resubscribing.
  const handler = useRef(onAction);
  handler.current = onAction;
  // Shared across effect runs: re-running the effect must never let the same
  // action be handled twice concurrently.
  const inflight = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || !isSystemNotificationsAvailable) return;
    const queue: SystemNotificationAction[] = [];
    const seen = new Set<string>();
    let draining = false;
    let mounted = true;

    async function drain() {
      if (draining) return;
      draining = true;
      try {
        while (queue.length && mounted) {
          const action = queue.shift() as SystemNotificationAction;
          try {
            if (await ledger.has(action.id)) {
              await acknowledgeActions([action.id]).catch(() => {});
              continue;
            }
            await handler.current(action);
            await ledger.record([action.id]);
            await acknowledgeActions([action.id]).catch(() => {});
          } catch (error) {
            // Leave this action unacknowledged so a later launch retries it, but
            // never let one unhandleable action stall the queue behind it.
            console.warn("Notification action failed", action.type, error);
          } finally {
            inflight.current.delete(action.id);
          }
        }
      } finally {
        draining = false;
      }
    }

    function push(action: SystemNotificationAction) {
      if (seen.has(action.id) || inflight.current.has(action.id)) return;
      seen.add(action.id);
      inflight.current.add(action.id);
      queue.push(action);
      void drain();
    }

    const subscription = subscribeToActions(push);
    void (async () => {
      // The ledger is shared with the handler, so hydrate before the snapshot
      // is queued: a redelivered action must not be handled a second time.
      await ledger.hydrate();
      // Native may not be answering yet during startup, so the snapshot gets a
      // second chance instead of being lost for the whole session.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const pending = await getPendingActions();
          if (!mounted) return;
          pending.forEach(push);
          return;
        } catch {
          // Second attempt, then give up until the next launch.
        }
      }
    })().catch(() => {});

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [enabled, ledger]);
}
