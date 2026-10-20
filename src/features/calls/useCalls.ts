import { useEffect, useState } from "react";
import type { Chat } from "../../domain/data";
import {
  remoteUid,
  timeLabel,
  type RemoteCallRecord,
} from "../../state/remoteMessengerTypes";
export type Call = {
  /** Session id shared with the system notification, never a contact id. */
  id: string;
  chat: Chat;
  video: boolean;
  status: "calling" | "incoming" | "active";
  seconds: number;
  /** Unix milliseconds when the call connected, used by the native chronometer. */
  connectedAt?: number;
  muted: boolean;
  speaker: boolean;
};
export function useCalls(onEnded: (record: RemoteCallRecord) => void) {
  const [call, setCall] = useState<Call | null>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (call?.status !== "calling") return;
    const timer = setTimeout(
      () => setCall((current) => connect(current)),
      2500,
    );
    return () => clearTimeout(timer);
  }, [call?.status]);
  useEffect(() => {
    if (call?.status !== "active") return;
    const timer = setInterval(
      () =>
        setCall((current) =>
          current?.status === "active"
            ? { ...current, seconds: current.seconds + 1 }
            : current,
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, [call?.status]);
  /**
   * `resume` continues a call that a system notification already announced, so
   * the engine and the notification use the same session id after a cold start.
   */
  function start(
    chat: Chat,
    video: boolean,
    incoming = false,
    resume?: { id: string },
  ) {
    if (call) {
      setFull(true);
      return;
    }
    setCall({
      id: resume?.id ?? remoteUid(),
      chat,
      video,
      status: incoming ? "incoming" : "calling",
      seconds: 0,
      muted: false,
      speaker: true,
    });
    setFull(!incoming);
  }
  function answer() {
    setCall((current) => connect(current));
    setFull(true);
  }
  function setMuted(value: boolean) {
    setCall((current) => (current ? { ...current, muted: value } : current));
  }
  function setSpeaker(value: boolean) {
    setCall((current) => (current ? { ...current, speaker: value } : current));
  }
  function end() {
    if (!call) return;
    onEnded({
      id: remoteUid(),
      chat: call.chat,
      video: call.video,
      seconds: call.seconds,
      time: timeLabel(),
      missed: call.status === "incoming",
    });
    setCall(null);
    setFull(false);
  }
  return { call, full, setFull, start, answer, end, setMuted, setSpeaker };
}
/** Answering and the simulated connect both produce a connected call. */
function connect(current: Call | null): Call | null {
  if (!current || current.status === "active") return current;
  return { ...current, status: "active", connectedAt: Date.now() };
}
