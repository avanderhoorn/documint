import type { StageBuffer, StageEvent } from "./types";

// Per-stage aggregate: count of events plus duration percentiles. Owned by
// the playground because the panel is the only consumer; the editor and
// component layers only produce events, never aggregate them.
export type StageAggregate = {
  count: number;
  p50: number;
  p99: number;
};

// Frozen sentinel returned for any aggregation that yields no events. Frozen
// (matching `EMPTY_META` in collector.ts) so that accidental mutation by a
// downstream consumer surfaces as a TypeError rather than silently corrupting
// every future empty result.
const EMPTY_AGGREGATE: Readonly<StageAggregate> = Object.freeze({ count: 0, p50: 0, p99: 0 });

// Walk a stage buffer newest → oldest, invoking `visitor` for each event
// whose timestamp lies within `[now - timeRangeMs, now]` (inclusive on both
// ends). With a wrapped buffer, the newest entry sits at `head - 1` and the
// oldest at `head` (one past the last write).
//
// Iteration order is part of the contract: the intent run-length grouping and
// the "latest in window" lookups for viewport/serialize meta both rely on
// the first visited event being the most recent one.
//
// The buffer is scanned in full (capacity ≤ 1024 by default) without
// assuming monotonic timestamps, which keeps the walk correct for tests
// that inject custom clocks producing out-of-order timestamps.
export function iterateBufferInWindow(
  buffer: StageBuffer,
  timeRangeMs: number,
  now: number,
  visitor: (event: StageEvent) => void,
): void {
  if (buffer.size === 0) return;
  const cutoff = now - timeRangeMs;

  for (let i = 0; i < buffer.size; i++) {
    const idx = (buffer.head - 1 - i + buffer.capacity) % buffer.capacity;
    const event = buffer.events[idx];
    if (event.timestamp < cutoff) continue;
    if (event.timestamp > now) continue;
    visitor(event);
  }
}

// Aggregate the events in a stage buffer that fall within the time window
// `[now - timeRangeMs, now]`. Returns count plus duration p50/p99.
//
// `visitor`, when supplied, is invoked once per in-window event in the same
// pass that collects durations. Stages with metadata breakdowns (paint
// tiers, transaction kinds, viewport/serialize "latest" lookups) use this
// to compute their extras without re-walking the buffer.
export function aggregateBuffer(
  buffer: StageBuffer,
  timeRangeMs: number,
  now: number = performance.now(),
  visitor?: (event: StageEvent) => void,
): StageAggregate {
  if (buffer.size === 0) return EMPTY_AGGREGATE;

  const durations: number[] = [];
  iterateBufferInWindow(buffer, timeRangeMs, now, (event) => {
    durations.push(event.durationMs);
    visitor?.(event);
  });

  if (durations.length === 0) return EMPTY_AGGREGATE;

  durations.sort((a, b) => a - b);
  return {
    count: durations.length,
    p50: percentile(durations, 50),
    p99: percentile(durations, 99),
  };
}

// Nearest-rank percentile on a pre-sorted ascending array.
function percentile(sorted: number[], p: number): number {
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.max(0, Math.min(sorted.length - 1, rank - 1));
  return sorted[index];
}
