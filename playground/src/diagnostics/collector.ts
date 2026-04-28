import {
  DIAGNOSTICS_STAGES,
  type DiagnosticsCollector,
  type DiagnosticsStage,
  type StageBuffer,
  type StageEventMeta,
} from "./types";

// Per-stage ring buffer capacity. At ~60 events/sec this holds ~17 seconds of
// history, comfortably above the 10s maximum aggregation window.
export const DIAGNOSTICS_BUFFER_CAPACITY = 1024;

// Reused for events that don't supply meta; freezing keeps callers honest and
// avoids per-event allocation when the stage produces no secondary data.
const EMPTY_META: StageEventMeta = Object.freeze({}) as StageEventMeta;

export type CreateDiagnosticsCollectorOptions = {
  // Injectable monotonic clock. Defaults to `performance.now`. Tests pass a
  // deterministic clock to verify timing-sensitive behavior without flakes.
  clock?: () => number;
  capacity?: number;
};

export function createDiagnosticsCollector(
  options: CreateDiagnosticsCollectorOptions = {},
): DiagnosticsCollector {
  const clock = options.clock ?? performance.now.bind(performance);
  const capacity = options.capacity ?? DIAGNOSTICS_BUFFER_CAPACITY;

  // Plain object keyed by stage string — V8 forms a stable hidden class so
  // each `buffers[stage]` is a monomorphic property load, avoiding the hash +
  // probe overhead of Map.get on every recorded event.
  const buffers = {} as Record<DiagnosticsStage, StageBuffer>;
  for (const stage of DIAGNOSTICS_STAGES) {
    buffers[stage] = createStageBuffer(capacity);
  }

  function push(
    stage: DiagnosticsStage,
    timestamp: number,
    durationMs: number,
    meta: StageEventMeta,
  ) {
    const buffer = buffers[stage];
    const slot = buffer.events[buffer.head];
    slot.timestamp = timestamp;
    slot.durationMs = durationMs;
    slot.meta = meta;
    buffer.head = (buffer.head + 1) % buffer.capacity;
    if (buffer.size < buffer.capacity) buffer.size++;
  }

  return {
    record(stage, meta, durationMs) {
      push(stage, clock(), durationMs ?? 0, meta ?? EMPTY_META);
    },
    getBuffer(stage) {
      return buffers[stage];
    },
  };
}

function createStageBuffer(capacity: number): StageBuffer {
  const events: StageBuffer["events"] = Array.from({ length: capacity }, () => ({
    timestamp: 0,
    durationMs: 0,
    meta: EMPTY_META,
  }));
  return { capacity, events, head: 0, size: 0 };
}
