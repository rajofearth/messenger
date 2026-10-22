import { useEffect, type MutableRefObject } from "react";

type Args = {
  selected: string | null;
  onlineSession: MutableRefObject<string>;
  presenceSession: MutableRefObject<string>;
  onRoomToken: (token: string | null) => void;
  heartbeatOnline: (args: {
    sessionId: string;
    interval: number;
  }) => Promise<unknown>;
  heartbeatPresence: (args: {
    conversationId: string;
    sessionId: string;
    interval: number;
  }) => Promise<{ roomToken: string }>;
  setTyping: (args: {
    conversationId: string;
    typing: boolean;
  }) => Promise<unknown>;
};

/** Keeps online presence and the open conversation's typing room alive. */
export function useRemotePresence({
  selected,
  onlineSession,
  presenceSession,
  onRoomToken,
  heartbeatOnline,
  heartbeatPresence,
  setTyping,
}: Args) {
  useEffect(() => {
    if (!selected) return;
    let active = true;
    onRoomToken(null);
    const heartbeat = () => {
      void heartbeatPresence({
        conversationId: selected,
        sessionId: presenceSession.current,
        interval: 30_000,
      })
        .then((result) => {
          if (active) onRoomToken(result.roomToken);
        })
        .catch(() => {});
    };
    heartbeat();
    const timer = setInterval(heartbeat, 15_000);
    return () => {
      active = false;
      clearInterval(timer);
      void setTyping({ conversationId: selected, typing: false }).catch(
        () => {},
      );
    };
  }, [
    heartbeatPresence,
    onRoomToken,
    presenceSession,
    selected,
    setTyping,
  ]);

  useEffect(() => {
    const heartbeat = () => {
      void heartbeatOnline({
        sessionId: onlineSession.current,
        interval: 30_000,
      }).catch(() => {});
    };
    heartbeat();
    const timer = setInterval(heartbeat, 15_000);
    return () => clearInterval(timer);
  }, [heartbeatOnline, onlineSession]);
}
