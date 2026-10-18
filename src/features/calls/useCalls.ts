import { useEffect, useState } from "react";
import type { Chat } from "../../domain/data";
import type { CallRecord } from "../../state/useMessenger";
import { clock, uid } from "../../state/useMessenger";
export type Call = {
  chat: Chat;
  video: boolean;
  status: "calling" | "incoming" | "active";
  seconds: number;
};
export function useCalls(onEnded: (record: CallRecord) => void) {
  const [call, setCall] = useState<Call | null>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (call?.status !== "calling") return;
    const timer = setTimeout(
      () =>
        setCall((current) =>
          current?.status === "calling"
            ? { ...current, status: "active" }
            : current,
        ),
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
  function start(chat: Chat, video: boolean, incoming = false) {
    if (call) {
      setFull(true);
      return;
    }
    setCall({
      chat,
      video,
      status: incoming ? "incoming" : "calling",
      seconds: 0,
    });
    setFull(!incoming);
  }
  function answer() {
    setCall((current) =>
      current ? { ...current, status: "active" } : current,
    );
    setFull(true);
  }
  function end() {
    if (!call) return;
    onEnded({
      id: uid(),
      chat: call.chat,
      video: call.video,
      seconds: call.seconds,
      time: clock(),
      missed: call.status === "incoming",
    });
    setCall(null);
    setFull(false);
  }
  return { call, full, setFull, start, answer, end };
}
