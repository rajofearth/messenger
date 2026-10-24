import { api } from "../../convex/_generated/api";
import { AppState } from "react-native";
import { convexClient } from "./convexClient";
import { deviceIdentity } from "./deviceIdentity";

const enabled = process.env.EXPO_PUBLIC_APP_VARIANT === "dev";
const MAX_QUEUE = 200;
const BATCH_SIZE = 25;

type TelemetryEvent = {
  event: string;
  occurredAt: number;
  durationMs?: number;
  bytes?: number;
  count?: number;
  index?: number;
  total?: number;
  video?: boolean;
  jsHeapUsedBytes?: number;
  errorCode?: string;
};

type JsPerformance = Performance & {
  memory?: { usedJSHeapSize?: number };
};

const queue: TelemetryEvent[] = [];
let sessionIdPromise: Promise<string> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

if (enabled) {
  AppState.addEventListener("change", (state) => {
    if (state !== "active") void flushDevTelemetry();
  });
}

function jsHeapUsedBytes() {
  const performance = globalThis.performance as JsPerformance | undefined;
  const value = performance?.memory?.usedJSHeapSize;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sessionId() {
  sessionIdPromise ??= deviceIdentity().then((device) =>
    `${device.deviceId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );
  return sessionIdPromise;
}

export function trackDevEvent(
  event: string,
  fields: Omit<TelemetryEvent, "event" | "occurredAt" | "jsHeapUsedBytes"> = {},
) {
  if (!enabled) return;
  queue.push({
    event,
    occurredAt: Date.now(),
    jsHeapUsedBytes: jsHeapUsedBytes(),
    ...fields,
  });
  if (queue.length >= BATCH_SIZE) void flushDevTelemetry();
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  scheduleFlush();
}

function scheduleFlush() {
  if (!enabled || flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushDevTelemetry();
  }, 2_000);
}

export async function flushDevTelemetry() {
  if (!enabled || flushing || !queue.length) return;
  flushing = true;
  const batch = queue.splice(0, BATCH_SIZE);
  try {
    await convexClient.mutation(api.devTelemetry.recordBatch, {
      sessionId: await sessionId(),
      events: batch,
    });
  } catch {
    queue.unshift(...batch);
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  } finally {
    flushing = false;
    if (queue.length) scheduleFlush();
  }
}
