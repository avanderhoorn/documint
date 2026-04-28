// Pure snapshot computation for the diagnostics panel. Reads ring buffers
// from a collector and produces a typed snapshot of all stage metrics.
// No React dependency — consumed by the useDiagnostics hook.

import type { DiagnosticsCollector, StageBuffer, StageEvent } from "./types";
import { aggregateBuffer, iterateBufferInWindow, type StageAggregate } from "./aggregation";

export type IntentGroup = { label: string; count: number };

export type DiagnosticsSnapshot = {
  intent: { count: number; status: "active" | "idle"; groupedOps: IntentGroup[] };
  parse: StageAggregate & { status: "active" | "idle" };
  command: StageAggregate & {
    status: "active" | "idle";
    replaceBlock: number;
    replaceRoot: number;
    replaceRootRange: number;
    replaceSelectionText: number;
  };
  transaction: StageAggregate & { status: "active" | "idle" };
  viewport: StageAggregate & { status: "active" | "idle" };
  paint: StageAggregate & {
    status: "active" | "idle";
    relayoutRepaint: number;
    repaintOnly: number;
  };
  overlay: StageAggregate & { status: "active" | "idle" };
  serialize: StageAggregate & { status: "active" | "idle"; deltaChars: number };
  paintsPerSecond: number;
  // Latest known virtualization counts. Sourced from the most recent viewport
  // event in the buffer regardless of the snapshot's time window — this is
  // current document state, not a rolling aggregation, so it must not decay
  // when the user narrows the window or when no viewport event has fired
  // recently. Defaults to 0/0 until the first viewport event.
  latestViewport: { laidOut: number; total: number };
};

const EMPTY_SNAPSHOT: DiagnosticsSnapshot = Object.freeze({
  intent: Object.freeze({
    count: 0,
    status: "idle" as const,
    groupedOps: Object.freeze([] as unknown as IntentGroup[]),
  }),
  parse: Object.freeze({ count: 0, p50: 0, p99: 0, status: "idle" as const }),
  command: Object.freeze({
    count: 0,
    p50: 0,
    p99: 0,
    status: "idle" as const,
    replaceBlock: 0,
    replaceRoot: 0,
    replaceRootRange: 0,
    replaceSelectionText: 0,
  }),
  transaction: Object.freeze({ count: 0, p50: 0, p99: 0, status: "idle" as const }),
  viewport: Object.freeze({
    count: 0,
    p50: 0,
    p99: 0,
    status: "idle" as const,
  }),
  paint: Object.freeze({
    count: 0,
    p50: 0,
    p99: 0,
    status: "idle" as const,
    relayoutRepaint: 0,
    repaintOnly: 0,
  }),
  overlay: Object.freeze({ count: 0, p50: 0, p99: 0, status: "idle" as const }),
  serialize: Object.freeze({ count: 0, p50: 0, p99: 0, status: "idle" as const, deltaChars: 0 }),
  paintsPerSecond: 0,
  latestViewport: Object.freeze({ laidOut: 0, total: 0 }),
}) as DiagnosticsSnapshot;

export { EMPTY_SNAPSHOT };

export function computeSnapshot(
  collector: DiagnosticsCollector,
  timeRangeMs: number,
  now: number = performance.now(),
): DiagnosticsSnapshot {
  const intentAgg = aggregateIntentBuffer(collector.getBuffer("intent"), timeRangeMs, now);
  const parse = withStatus(aggregateBuffer(collector.getBuffer("parse"), timeRangeMs, now));
  const commandAgg = aggregateBuffer(collector.getBuffer("command"), timeRangeMs, now);

  // Single walk of the transaction buffer feeds both the `transaction`
  // aggregate (durations) and the `command` extras (kind breakdown).
  const transactionKinds = newTransactionKinds();
  const transactionAgg = aggregateBuffer(
    collector.getBuffer("transaction"),
    timeRangeMs,
    now,
    (event) => recordTransactionKind(transactionKinds, event),
  );

  // Viewport aggregate is rolling-window like the others; the "latest known"
  // virtualization counts (current document state) are computed separately
  // below so they don't decay with the window.
  const viewportAgg = aggregateBuffer(collector.getBuffer("viewport"), timeRangeMs, now);

  // Single walk of the paint buffer feeds the aggregate and the tier
  // breakdown.
  const paintTiers = newPaintTiers();
  const paintAgg = aggregateBuffer(collector.getBuffer("paint"), timeRangeMs, now, (event) =>
    recordPaintTier(paintTiers, event),
  );

  const overlay = withStatus(aggregateBuffer(collector.getBuffer("overlay"), timeRangeMs, now));

  // Single walk of the serialize buffer feeds the aggregate and captures
  // the latest in-window deltaChars value.
  const serializeLatest = newSerializeLatest();
  const serializeAgg = aggregateBuffer(
    collector.getBuffer("serialize"),
    timeRangeMs,
    now,
    (event) => captureLatest(serializeLatest, event, "deltaChars"),
  );

  return {
    intent: {
      count: intentAgg.count,
      status: intentAgg.count > 0 ? "active" : "idle",
      groupedOps: intentAgg.groupedOps,
    },
    parse,
    command: { ...withStatus(commandAgg), ...transactionKinds },
    transaction: withStatus(transactionAgg),
    viewport: withStatus(viewportAgg),
    paint: { ...withStatus(paintAgg), ...paintTiers },
    overlay,
    serialize: { ...withStatus(serializeAgg), deltaChars: serializeLatest.deltaChars },
    paintsPerSecond: countPaintsInLastSecond(collector.getBuffer("paint"), now),
    latestViewport: peekLatestViewport(collector.getBuffer("viewport")),
  };
}

function withStatus(agg: StageAggregate): StageAggregate & { status: "active" | "idle" } {
  return { ...agg, status: agg.count > 0 ? "active" : "idle" };
}

// Intent: count events in window + run-length group consecutive identical ops.
// Stays its own walk because intent events have no duration to aggregate.
function aggregateIntentBuffer(
  buffer: StageBuffer,
  timeRangeMs: number,
  now: number,
): { count: number; groupedOps: IntentGroup[] } {
  const groupedOps: IntentGroup[] = [];
  let count = 0;

  iterateBufferInWindow(buffer, timeRangeMs, now, (event) => {
    count++;
    const name = (event.meta.name as string) ?? "unknown";
    const last = groupedOps[groupedOps.length - 1];
    if (last && last.label === name) {
      last.count++;
    } else {
      groupedOps.push({ label: name, count: 1 });
    }
  });

  return { count, groupedOps };
}

// PaintsPerSecond uses a fixed 1-second window independent of the snapshot's
// `timeRangeMs`, so it must remain a separate walk.
function countPaintsInLastSecond(buffer: StageBuffer, now: number): number {
  let count = 0;
  iterateBufferInWindow(buffer, 1000, now, () => {
    count++;
  });
  return count;
}

// Latest known virtualization counts. Reads the newest event in the buffer
// directly (head - 1) without consulting the time window, because this is
// current document state — narrowing the panel's time range must not make
// it look like blocks unloaded. Returns 0/0 when no viewport event has been
// recorded yet.
function peekLatestViewport(buffer: StageBuffer): { laidOut: number; total: number } {
  if (buffer.size === 0) return { laidOut: 0, total: 0 };
  const newestIdx = (buffer.head - 1 + buffer.capacity) % buffer.capacity;
  const meta = buffer.events[newestIdx].meta;
  return {
    laidOut: (meta.laidOut as number) ?? 0,
    total: (meta.total as number) ?? 0,
  };
}

// --- Per-stage breakdown accumulators -------------------------------------
// Each stage with extras owns a tiny `new…` factory and a `record…` /
// `capture…` visitor. Keeping them as small explicit pairs reads more
// clearly than a generic table abstraction at this size.

type TransactionKinds = {
  replaceBlock: number;
  replaceRoot: number;
  replaceRootRange: number;
  replaceSelectionText: number;
};

function newTransactionKinds(): TransactionKinds {
  return { replaceBlock: 0, replaceRoot: 0, replaceRootRange: 0, replaceSelectionText: 0 };
}

function recordTransactionKind(acc: TransactionKinds, event: StageEvent): void {
  switch (event.meta.name) {
    case "replace-block":
      acc.replaceBlock++;
      break;
    case "replace-root":
      acc.replaceRoot++;
      break;
    case "replace-root-range":
      acc.replaceRootRange++;
      break;
    case "replace-selection":
      acc.replaceSelectionText++;
      break;
  }
}

type PaintTiers = { relayoutRepaint: number; repaintOnly: number };

function newPaintTiers(): PaintTiers {
  return { relayoutRepaint: 0, repaintOnly: 0 };
}

function recordPaintTier(acc: PaintTiers, event: StageEvent): void {
  if (event.meta.tier === "viewport") acc.relayoutRepaint++;
  else if (event.meta.tier === "content") acc.repaintOnly++;
}

type SerializeLatest = { deltaChars: number; seen: boolean };

function newSerializeLatest(): SerializeLatest {
  return { deltaChars: 0, seen: false };
}

// `captureLatest` writes meta keys from the FIRST visited event into the
// accumulator and ignores subsequent events. Iteration is newest → oldest,
// so the first visited event is the most recent one in the window — the
// `seen` guard preserves that "newest wins" semantics.
function captureLatest<T extends { seen: boolean }>(
  acc: T,
  event: StageEvent,
  ...keys: (keyof T & string)[]
): void {
  if (acc.seen) return;
  acc.seen = true;
  for (const key of keys) {
    (acc as Record<string, unknown>)[key] = (event.meta[key] as number) ?? 0;
  }
}
