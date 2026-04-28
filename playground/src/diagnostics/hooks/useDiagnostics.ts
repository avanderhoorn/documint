// React hook that bridges the diagnostics collector's ring buffers to the
// panel component tree. Polls on a throttled interval (500ms) and produces
// a referentially-stable snapshot for each stage.

import { useCallback, useEffect, useRef, useState } from "react";
import type { DiagnosticsCollector } from "../types";
import { computeSnapshot, EMPTY_SNAPSHOT, type DiagnosticsSnapshot } from "../snapshot";

const POLL_INTERVAL_MS = 500;

export function useDiagnostics(
  collector: DiagnosticsCollector | undefined,
  timeRange: number,
): DiagnosticsSnapshot {
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot>(EMPTY_SNAPSHOT);
  const collectorRef = useRef(collector);
  const timeRangeRef = useRef(timeRange);
  const prevSnapshotRef = useRef<DiagnosticsSnapshot>(EMPTY_SNAPSHOT);

  collectorRef.current = collector;
  timeRangeRef.current = timeRange;

  // Read the latest collector + timeRange via refs so the interval doesn't
  // need to be torn down and recreated when `timeRange` changes.
  const recompute = useCallback(() => {
    const c = collectorRef.current;
    if (!c) return;
    const next = computeSnapshot(c, timeRangeRef.current * 1000, performance.now());
    if (snapshotsEqual(prevSnapshotRef.current, next)) return;
    prevSnapshotRef.current = next;
    setSnapshot(next);
  }, []);

  useEffect(() => {
    if (!collector) {
      setSnapshot(EMPTY_SNAPSHOT);
      prevSnapshotRef.current = EMPTY_SNAPSHOT;
      return;
    }
    recompute();
    const id = setInterval(recompute, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [collector, recompute]);

  // Recompute eagerly when timeRange changes (don't wait for the next tick).
  useEffect(() => {
    recompute();
  }, [timeRange, recompute]);

  return snapshot;
}

// Per-stage list of the extra metadata fields each stage carries on top of
// `StageAggregate + status`. Typed as `Required` so adding a stage to
// `DiagnosticsSnapshot` fails the build until an entry is added here, and
// `snapshotsEqual` automatically picks up the new fields.
type StageKey = Exclude<keyof DiagnosticsSnapshot, "intent" | "paintsPerSecond" | "latestViewport">;

const STAGE_EXTRAS: { [K in StageKey]: readonly (keyof DiagnosticsSnapshot[K])[] } = {
  parse: [],
  command: ["replaceBlock", "replaceRoot", "replaceRootRange", "replaceSelectionText"],
  transaction: [],
  viewport: [],
  paint: ["relayoutRepaint", "repaintOnly"],
  overlay: [],
  serialize: ["deltaChars"],
};

function snapshotsEqual(a: DiagnosticsSnapshot, b: DiagnosticsSnapshot): boolean {
  if (a === b) return true;
  if (a.paintsPerSecond !== b.paintsPerSecond) return false;
  if (a.latestViewport.laidOut !== b.latestViewport.laidOut) return false;
  if (a.latestViewport.total !== b.latestViewport.total) return false;
  if (a.intent.count !== b.intent.count) return false;
  if (!groupedOpsEqual(a.intent.groupedOps, b.intent.groupedOps)) return false;

  for (const stage of Object.keys(STAGE_EXTRAS) as StageKey[]) {
    const sa = a[stage];
    const sb = b[stage];
    if (sa.count !== sb.count || sa.p50 !== sb.p50 || sa.p99 !== sb.p99) return false;
    for (const key of STAGE_EXTRAS[stage]) {
      if (sa[key as keyof typeof sa] !== sb[key as keyof typeof sb]) return false;
    }
  }
  return true;
}

function groupedOpsEqual(
  a: readonly { label: string; count: number }[],
  b: readonly { label: string; count: number }[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].label !== b[i].label || a[i].count !== b[i].count) return false;
  }
  return true;
}
