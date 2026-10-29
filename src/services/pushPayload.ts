/**
 * The one parser for a wake push.
 *
 * A wake message is data-only: `{ v: "1", type: "wake", queueId: "..." }` with
 * string values. It carries no content, so the OS never renders it. Never add a
 * title, message or body key to a wake payload: expo-notifications presents its
 * own notification for those keys, and a wake must stay invisible.
 *
 * Two shapes reach this module. A data message read straight from FCM has the
 * fields under `payload.data`; the task `expo-notifications` runs receives the
 * serialized `RemoteMessage` instead, so the same fields sit under
 * `payload.data.data`. Both are accepted; everything else is rejected.
 */

export type Wake = { v: "1"; type: "wake"; queueId: string };

export const WAKE_QUEUE_ID_MAX = 128;

type Fields = Record<string, unknown>;

function record(value: unknown): Fields | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Fields;
}

/** The data map, either the FCM one or the `RemoteMessage` nested one. */
function messageFields(data: Fields): Fields {
  const nested = record(data.data);
  return nested && "queueId" in nested ? nested : data;
}

export function parseWake(payload: unknown): Wake | null {
  try {
    const root = record(payload);
    if (!root) return null;
    const data = record(root.data);
    if (!data) return null;
    const fields = messageFields(data);
    if (fields.v !== "1" || fields.type !== "wake") return null;
    const queueId = fields.queueId;
    if (typeof queueId !== "string") return null;
    if (queueId.length === 0 || queueId.length > WAKE_QUEUE_ID_MAX) return null;
    return { v: "1", type: "wake", queueId };
  } catch {
    // A payload is untrusted input from the network; parsing must never throw.
    return null;
  }
}
