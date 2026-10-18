/**
 * Survives a process restart so an answered system notification can rebuild the
 * call it belongs to. The native module keeps the notification; this keeps the
 * minimum needed to hand the same session id back to the call engine.
 */

import { messengerRepository } from "../../data/messengerRepository";
import type { PendingCallRecord } from "../../data/records";

export function rememberIncomingCall(record: PendingCallRecord) {
  return messengerRepository.savePendingCall(record).catch(() => {});
}

export function forgetIncomingCall() {
  return messengerRepository.savePendingCall(null).catch(() => {});
}

/**
 * Returns the stored call when it is still ringing, and clears it otherwise.
 * A stale record must never reanimate a call the user can no longer answer.
 */
export async function resumeIncomingCall(
  callId: string,
): Promise<PendingCallRecord | null> {
  const stored = await readIncomingCall(callId);
  if (!stored) return null;
  const expired = Date.now() - stored.receivedAt > stored.timeoutMs;
  if (expired) await forgetIncomingCall();
  return expired ? null : stored;
}

/**
 * The stored call for this id, expired or not. Declining or hanging up from a
 * notification still means the call was missed, so that path must not depend on
 * the ringing window that `resumeIncomingCall` enforces for answering.
 */
export async function readIncomingCall(
  callId: string,
): Promise<PendingCallRecord | null> {
  const stored = await messengerRepository.loadPendingCall().catch(() => undefined);
  if (!stored || stored.callId !== callId) return null;
  return stored;
}
