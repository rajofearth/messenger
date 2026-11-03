import { useCallback } from "react";
import type { Chat } from "../../domain/data";
import { useCallSignaling } from "./useCallSignaling";
import { useCalls } from "./useCalls";

type Messenger = {
  addCall: Parameters<typeof useCalls>[0];
  selfId?: string;
  chats: Chat[];
};

/** Composes the local call lifecycle with Convex's WebRTC signal transport. */
export function useCallSession(messenger: Messenger) {
  const calls = useCalls(messenger.addCall, messenger.selfId);
  const signaling = useCallSignaling({
    call: calls.call,
    selfId: messenger.selfId,
    chats: messenger.chats,
    onIncoming: ({ chat, callId, fromUserId, video }) =>
      calls.start(chat, video, true, { id: callId, peerId: fromUserId }),
  });
  const onEngineState = useCallback(
    (state: string) => {
      if (state === "connected") calls.connected();
      if (state === "ended") calls.end();
    },
    [calls],
  );
  return { ...calls, ...signaling, onEngineState };
}
