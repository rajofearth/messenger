/**
 * The drain half of the relay: pull envelopes, commit them, then acknowledge.
 *
 * The server is allowed to delete an envelope once it is acknowledged, so the
 * ack must never leave before the SQLite commit. `runRelayDrain` holds that
 * order with injected dependencies, which keeps it testable without Convex or
 * SQLite; `drainRelay` wires the real client, repository and media cache.
 */

import { api } from "../../convex/_generated/api";
import type { MessageRecord } from "../data/records";
import { messengerRepository } from "../data/messengerRepository";
import { timeLabel } from "../state/remoteMessengerTypes";
import { convexClient } from "./convexClient";
import { cacheRemoteMedia } from "./mediaCache";

export type RelayEnvelope = {
  queueId: string;
  conversationId: string;
  op: "message" | "reaction" | "delete";
  sequence: number;
  senderId: string;
  createdAt: number;
  message?: {
    id: string;
    text?: string;
    kind?: "image" | "video" | "audio" | "file";
    uri?: string;
    variants?: Array<{
      name: string;
      width: number;
      height: number;
      mimeType: string;
      uri: string;
    }>;
    filename?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    duration?: number;
    replyTo?: { id: string; text: string; mine: boolean };
  };
  targetMessageId?: string;
  reactionKey?: string;
};

export type RelayDrainDeps = {
  pull: () => Promise<{ entries: RelayEnvelope[]; more: boolean }>;
  ack: (queueIds: string[]) => Promise<unknown>;
  save: (
    chatId: string,
    messages: MessageRecord[],
    queueIds: string[],
  ) => Promise<void>;
  materializeMedia?: (entry: RelayEnvelope) => Promise<string | undefined>;
  pending?: () => Promise<{ queueId: string; conversationId: string }[]>;
  clearPending?: (ids: string[]) => Promise<void>;
  /**
   * Ops carry no message payload, so they cannot ride the batch save. Both are
   * optional so a caller without a local write path simply leaves them queued.
   */
  applyReaction?: (
    chatId: string,
    messageId: string,
    reaction: string | undefined,
  ) => Promise<void>;
  applyDelete?: (chatId: string, messageId: string) => Promise<void>;
};

type ConversationBatch = {
  chatId: string;
  messages: MessageRecord[];
  queueIds: string[];
  ops: RelayEnvelope[];
};

function messageRecord(
  entry: RelayEnvelope,
  selfId: string,
  uri: string | undefined,
): MessageRecord | undefined {
  const payload = entry.message;
  if (!payload) return undefined;
  const at = Number.isFinite(entry.createdAt)
    ? new Date(entry.createdAt)
    : undefined;
  const createdAt = at && !Number.isNaN(at.getTime())
    ? at.toISOString()
    : undefined;
  return {
    id: payload.id,
    text: payload.text,
    mine: entry.senderId === selfId,
    time: createdAt === undefined ? "" : timeLabel(entry.createdAt),
    kind: payload.kind,
    replyTo: payload.replyTo ? { ...payload.replyTo } : undefined,
    createdAt,
    mimeType: payload.mimeType,
    width: payload.width,
    height: payload.height,
    uri: uri ?? payload.uri,
    // The stored widths live in the same blob set that the ack releases, so a
    // row that keeps them would point at URLs this phone cannot load after the
    // acknowledgement. The local copy is the only width this phone needs.
    variants: undefined,
    filename: payload.filename,
    duration: payload.duration,
    sequence: entry.sequence,
  };
}

/**
 * A failed download skips the envelope instead of saving a message whose bytes
 * the server is about to delete. The queue id stays unacknowledged, so the next
 * drain tries the same attachment again.
 */
async function prepareMessage(
  deps: RelayDrainDeps,
  entry: RelayEnvelope,
  selfId: string,
): Promise<MessageRecord | undefined> {
  const payload = entry.message;
  if (!payload) return undefined;
  let uri = payload.uri;
  if (uri && deps.materializeMedia) {
    try {
      const local = await deps.materializeMedia(entry);
      if (!local) return undefined;
      uri = local;
    } catch {
      return undefined;
    }
  }
  return messageRecord(entry, selfId, uri);
}

async function prepareBatches(
  deps: RelayDrainDeps,
  entries: readonly RelayEnvelope[],
  selfId: string,
): Promise<ConversationBatch[]> {
  const groups = new Map<string, ConversationBatch>();
  for (const entry of entries) {
    let group = groups.get(entry.conversationId);
    if (!group) {
      group = {
        chatId: entry.conversationId,
        messages: [],
        queueIds: [],
        ops: [],
      };
      groups.set(entry.conversationId, group);
    }
    if (entry.op === "reaction" || entry.op === "delete") {
      group.ops.push(entry);
      continue;
    }
    const message = await prepareMessage(deps, entry, selfId);
    if (!message) continue;
    group.messages.push(message);
    group.queueIds.push(entry.queueId);
  }
  return [...groups.values()];
}

async function applyOp(
  deps: RelayDrainDeps,
  entry: RelayEnvelope,
): Promise<boolean> {
  if (!entry.targetMessageId) return false;
  try {
    if (entry.op === "reaction" && deps.applyReaction) {
      await deps.applyReaction(
        entry.conversationId,
        entry.targetMessageId,
        entry.reactionKey,
      );
      return true;
    }
    if (entry.op === "delete" && deps.applyDelete) {
      await deps.applyDelete(entry.conversationId, entry.targetMessageId);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Commits every conversation in the page and returns the queue ids that are
 * safe to acknowledge. A failed save leaves its whole group queued: nothing in
 * it was written, so acking any part of it would drop content the phone lacks.
 */
async function drainPage(
  deps: RelayDrainDeps,
  entries: readonly RelayEnvelope[],
  selfId: string,
  touched: Set<string>,
): Promise<string[]> {
  const saved: string[] = [];
  for (const group of await prepareBatches(deps, entries, selfId)) {
    let writable = true;
    if (group.messages.length) {
      try {
        await deps.save(group.chatId, group.messages, group.queueIds);
        saved.push(...group.queueIds);
        touched.add(group.chatId);
      } catch {
        writable = false;
      }
    }
    if (!writable) continue;
    // Ops run after the page's messages: a delete that names a message in the
    // same batch must never land before that row exists.
    for (const entry of group.ops) {
      if (!(await applyOp(deps, entry))) continue;
      saved.push(entry.queueId);
      touched.add(entry.conversationId);
    }
  }
  return saved;
}

/** Sends the ack, then drops the rows. A failed ack keeps them for a retry. */
async function acknowledge(
  deps: RelayDrainDeps,
  queueIds: readonly string[],
): Promise<string[]> {
  if (!queueIds.length) return [];
  try {
    await deps.ack([...queueIds]);
  } catch {
    return [];
  }
  try {
    await deps.clearPending?.([...queueIds]);
  } catch {
    // The server has already accepted the ack; a stale row only causes one
    // more idempotent ack on the next drain.
  }
  return [...queueIds];
}

/** Crash recovery: settle acks a previous process committed but never sent. */
async function flushPending(deps: RelayDrainDeps): Promise<void> {
  if (!deps.pending) return;
  let pending: { queueId: string; conversationId: string }[];
  try {
    pending = await deps.pending();
  } catch {
    return;
  }
  const ids = [...new Set(pending.map((item) => item.queueId))];
  await acknowledge(deps, ids);
}

/**
 * Drains the queue and returns the conversation ids it wrote to. It never
 * throws: a failure leaves the affected envelopes queued for the next launch,
 * foreground or wake, and the scan keeps going for the other conversations.
 */
export async function runRelayDrain(
  deps: RelayDrainDeps,
  selfId: string,
): Promise<string[]> {
  const touched = new Set<string>();
  try {
    await flushPending(deps);
    while (true) {
      let page: { entries: RelayEnvelope[]; more: boolean };
      try {
        page = await deps.pull();
      } catch {
        break;
      }
      const saved = await drainPage(deps, page.entries, selfId, touched);
      const acked = await acknowledge(deps, saved);
      // Without an ack the next pull would return the same page forever.
      if (!page.more || !acked.length) break;
    }
  } catch {
    // A malformed page must not crash the caller. Everything already written
    // is acknowledged by its pending row, and the rest waits for the next drain.
  }
  return [...touched];
}

/** App-only wiring: the drain is the one place Convex and SQLite meet. */
export async function drainRelay(selfId: string): Promise<string[]> {
  return runRelayDrain(
    {
      pull: async () => {
        const page = await convexClient.query(api.relay.pull, {});
        return { entries: page.entries, more: page.more };
      },
      ack: (queueIds) => convexClient.mutation(api.relay.ack, { queueIds }),
      save: (chatId, messages, queueIds) =>
        messengerRepository.saveRelayBatch(chatId, messages, queueIds),
      materializeMedia: async (entry) => {
        const payload = entry.message;
        if (!payload?.uri) return undefined;
        let uri: string | undefined;
        try {
          uri = await cacheRemoteMedia({
            id: payload.id,
            uri: payload.uri,
            filename: payload.filename,
            mimeType: payload.mimeType,
            kind: payload.kind,
          });
        } catch {
          return undefined;
        }
        if (!uri) return undefined;
        // The cache returns a remote URL after a failed download. The server
        // drops the blob once the ack lands, so that URL is not a local copy.
        return /^https?:\/\//i.test(uri) ? undefined : uri;
      },
      pending: () => messengerRepository.loadPendingAcks(),
      clearPending: (ids) => messengerRepository.clearPendingAcks(ids),
      applyReaction: (chatId, messageId, reaction) =>
        messengerRepository.applyRelayReaction(chatId, messageId, reaction),
      applyDelete: (chatId, messageId) =>
        messengerRepository.applyRelayDelete(chatId, messageId),
    },
    selfId,
  );
}
