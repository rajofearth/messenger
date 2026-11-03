import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import type { Chat } from "../../domain/data";
import type { Call } from "./useCalls";
import type { CallSignal, CallSignalKind } from "./CallWebView";

type IncomingCall = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  video: boolean;
};

type Props = {
  call: Call | null;
  selfId?: string;
  chats: Chat[];
  onIncoming: (call: IncomingCall & { chat: Chat }) => void;
};

/** Bridges WebView SDP/ICE messages to the short-lived Convex signal table. */
export function useCallSignaling({ call, selfId, chats, onIncoming }: Props) {
  const sendMutation = useMutation(api.calls.sendSignal);
  const incoming = useQuery(api.calls.incoming, {});
  const signals = useQuery(
    api.calls.forCall,
    call ? { callId: call.id } : "skip",
  ) as CallSignal[] | undefined;
  const seenIncoming = useRef(new Set<string>());
  const sentInvites = useRef(new Set<string>());
  const previousCall = useRef<Call | null>(null);
  const onIncomingRef = useRef(onIncoming);
  onIncomingRef.current = onIncoming;

  useEffect(() => {
    const ended = previousCall.current;
    if (ended && !call && ended.peerId) {
      void sendMutation({
        callId: ended.id,
        conversationId: ended.chat.id,
        toUserId: ended.peerId as Id<"users">,
        kind: "end",
        payload: "{}",
      }).catch(() => {});
    }
    previousCall.current = call;
  }, [call, sendMutation]);

  useEffect(() => {
    if (call || !incoming) return;
    for (const item of incoming) {
      if (seenIncoming.current.has(item.callId)) continue;
      const chat = chats.find((candidate) => candidate.id === item.conversationId);
      if (!chat || chat.group) continue;
      let video = false;
      try {
        video = Boolean((JSON.parse(item.payload) as { video?: boolean }).video);
      } catch {
        continue;
      }
      seenIncoming.current.add(item.callId);
      onIncomingRef.current({
        callId: item.callId,
        conversationId: item.conversationId,
        fromUserId: item.fromUserId,
        video,
        chat,
      });
      break;
    }
  }, [call, chats, incoming]);

  useEffect(() => {
    if (!call || call.status !== "calling" || !call.initiator || !selfId) return;
    if (!call.peerId || sentInvites.current.has(call.id)) return;
    sentInvites.current.add(call.id);
    void sendMutation({
      callId: call.id,
      conversationId: call.chat.id,
      toUserId: call.peerId as Id<"users">,
      kind: "invite",
      payload: JSON.stringify({ video: call.video }),
    }).catch(() => {
      sentInvites.current.delete(call.id);
    });
  }, [call, selfId, sendMutation]);

  async function sendSignal(kind: CallSignalKind, payload: string) {
    if (!call || !call.peerId) return;
    await sendMutation({
      callId: call.id,
      conversationId: call.chat.id,
      toUserId: call.peerId as Id<"users">,
      kind,
      payload,
    });
  }

  return { signals: signals ?? [], sendSignal };
}
