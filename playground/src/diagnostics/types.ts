// Shared types for the diagnostics subsystem. The collector is a plain object
// fed by the playground's lifecycle sink (see `Playground.tsx`) and read by
// `computeSnapshot`. The editor and component layers never see the collector
// — they only emit `LifecycleEvent`s, which the playground translates into
// `record(stage, meta, durationMs)` calls.

import type { LifecycleEvent } from "@/lifecycle";

// Diagnostics stages map 1:1 onto lifecycle event discriminators — there is
// only one taxonomy. The runtime tuple is `satisfies`-checked against the
// union so adding or removing a lifecycle event variant fails the build here
// until the buffer set is updated.
export const DIAGNOSTICS_STAGES = [
  "intent",
  "parse",
  "command",
  "transaction",
  "viewport",
  "paint",
  "overlay",
  "serialize",
] as const satisfies readonly LifecycleEvent["type"][];

export type DiagnosticsStage = LifecycleEvent["type"];

// Caller-supplied `meta` is stored by reference, not cloned, to honor the
// near-zero-allocation design principle. Callers MUST pass a fresh object per
// event (or `undefined`) and treat the object as owned by the collector after
// recording — mutating it later would rewrite history retroactively.
export type StageEventMeta = Record<string, unknown>;

export type StageEvent = {
  timestamp: number;
  durationMs: number;
  meta: StageEventMeta;
};

// Fixed-capacity ring buffer. `events` is pre-allocated to capacity; `head` is
// the next write slot; `size` is the count of populated slots, capped at
// capacity. Iteration order is consumer-defined (see aggregation).
export type StageBuffer = {
  readonly capacity: number;
  events: StageEvent[];
  head: number;
  size: number;
};

export type DiagnosticsCollector = {
  // `durationMs` may be supplied when the event has been timed by the caller
  // (e.g. lifecycle adapters bridging from a pre-measured event stream). When
  // omitted the recorded duration is 0, preserving the original "marker"
  // semantics used by callers that only need a timestamp.
  record(stage: DiagnosticsStage, meta?: StageEventMeta, durationMs?: number): void;
  getBuffer(stage: DiagnosticsStage): StageBuffer;
};
