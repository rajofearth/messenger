/**
 * The one-line rollback to the component send path: set this to false and the
 * app sends text, attachments, reactions and deletes through convex/chat again.
 */
export const RELAY_ENABLED = true;

/** Files larger than this are refused before they ever reach the relay queue. */
export const RELAY_MEDIA_LIMIT_BYTES = 2 * 1024 * 1024;

type RelayErrorData = {
  code?: string;
  lastSeenAt?: number;
};

function relayErrorData(error: unknown): RelayErrorData | undefined {
  if (!error || typeof error !== "object" || !("data" in error)) {
    return undefined;
  }
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== "object") return undefined;
  return data as RelayErrorData;
}

/** A locally raised refusal carries no ConvexError payload, only its code. */
const LOCAL_RELAY_CODES = [
  "QUEUE_FULL",
  "QUEUE_MEDIA_TOO_LARGE",
  "MESSAGE_EMPTY",
  "MESSAGE_TOO_LONG",
  "ATTACHMENT_NOT_FOUND",
];

function relayErrorCode(error: unknown): string | undefined {
  const code = relayErrorData(error)?.code;
  if (code) return code;
  if (!(error instanceof Error)) return undefined;
  return LOCAL_RELAY_CODES.find((item) => error.message.includes(item));
}

/**
 * Turns a relay rejection into a sentence the user can act on. Component and
 * upload errors return undefined so the caller keeps its existing mapping.
 */
export function relayErrorMessage(error: unknown): string | undefined {
  const code = relayErrorCode(error);
  if (code === "QUEUE_FULL") {
    const lastSeenAt = relayErrorData(error)?.lastSeenAt;
    const seen =
      typeof lastSeenAt === "number" &&
      Number.isFinite(lastSeenAt) &&
      lastSeenAt > 0
        ? new Date(lastSeenAt).toLocaleString()
        : "a while ago";
    return `Their phone has not opened Messenger since ${seen}`;
  }
  if (code === "QUEUE_MEDIA_TOO_LARGE") {
    return "Attachments over 2 MB cannot be queued";
  }
  if (code === "MESSAGE_EMPTY") return "Type a message before sending";
  if (code === "MESSAGE_TOO_LONG") return "That message is too long to send";
  if (code === "ATTACHMENT_NOT_FOUND") {
    return "That attachment is no longer available. Pick it again.";
  }
  return undefined;
}
