/**
 * Mirrors the in-app call state into the Android system notification.
 *
 * One notification per call session: ringing, dialling, then the connected call
 * with its chronometer, mute and speaker buttons. The notification is dismissed
 * when the call ends, so nothing is left behind in the shade.
 */

import { useEffect, useRef } from "react";
import { localAvatarUri } from "../../data/avatars";
import {
  dismissCall,
  isSystemNotificationsAvailable,
  showCall,
} from "../../services/systemNotifications";
import {
  callPayload,
  type CallNotificationState,
} from "../../notifications/payloads";
import type { Call } from "./useCalls";

function stateOf(call: Call): CallNotificationState {
  if (call.status === "incoming") return "incoming";
  return call.status === "active" ? "ongoing" : "outgoing";
}

export function useCallNotifications(call: Call | null, enabled: boolean) {
  const published = useRef<string | null>(null);
  const active = useRef<string | null>(null);

  useEffect(() => {
    if (!isSystemNotificationsAvailable) return;
    if (!enabled) {
      const finished = active.current;
      active.current = null;
      published.current = null;
      if (finished) void dismissCall(finished).catch(() => {});
      return;
    }
    if (!call) {
      const finished = active.current;
      active.current = null;
      published.current = null;
      if (finished) void dismissCall(finished).catch(() => {});
      return;
    }
    active.current = call.id;
    const state = stateOf(call);
    let cancelled = false;
    void (async () => {
      const avatarPromise = localAvatarUri(call.chat.avatar).catch(() => undefined);
      const post = async (avatarUri?: string) => {
        if (cancelled) return;
        const signature = [
          call.id,
          state,
          call.video,
          call.muted,
          call.speaker,
          call.connectedAt ?? 0,
          avatarUri ?? "",
        ].join(":");
        if (published.current === signature) return;
        const result = await showCall(
          callPayload({
            callId: call.id,
            chat: call.chat,
            state,
            video: call.video,
            connectedAt: call.connectedAt,
            muted: call.muted,
            speaker: call.speaker,
            avatarUri,
            timeoutMs: 60_000,
          }),
        ).catch(() => undefined);
      // Only a settled post may be remembered, or a failed one would never be
      // retried while the call state stays the same.
        if (result?.posted === true) published.current = signature;
      };
      await post();
      const avatarUri = await avatarPromise;
      if (avatarUri) await post(avatarUri);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    call?.id,
    call?.status,
    call?.muted,
    call?.speaker,
    call?.video,
    call?.connectedAt,
    call?.chat.id,
    call?.chat.avatar,
    enabled,
  ]);
}
