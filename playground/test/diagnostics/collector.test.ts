import { beforeEach, describe, expect, test } from "bun:test";
import {
  DIAGNOSTICS_BUFFER_CAPACITY,
  DIAGNOSTICS_STAGES,
  createDiagnosticsCollector,
  type DiagnosticsCollector,
} from "../../src/diagnostics";

function createTestClock(start = 1000) {
  let now = start;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
    set(value: number) {
      now = value;
    },
  };
}

// Assert via head/size semantics rather than raw `events[0]` indexing so
// these tests stop pinning the ring buffer's slot-allocation order.
function newestEvent(buffer: ReturnType<DiagnosticsCollector["getBuffer"]>) {
  if (buffer.size === 0) throw new Error("buffer is empty");
  const idx = (buffer.head - 1 + buffer.capacity) % buffer.capacity;
  return buffer.events[idx];
}

function oldestEvent(buffer: ReturnType<DiagnosticsCollector["getBuffer"]>) {
  if (buffer.size === 0) throw new Error("buffer is empty");
  const idx = (buffer.head - buffer.size + buffer.capacity) % buffer.capacity;
  return buffer.events[idx];
}

describe("createDiagnosticsCollector", () => {
  let clock: ReturnType<typeof createTestClock>;
  let collector: DiagnosticsCollector;

  beforeEach(() => {
    clock = createTestClock();
    collector = createDiagnosticsCollector({ clock: clock.now });
  });

  test("record pushes an event with timestamp, duration, and meta", () => {
    clock.advance(5);
    collector.record("command", { name: "insertText" }, 5);

    const buffer = collector.getBuffer("command");
    expect(buffer.size).toBe(1);
    expect(newestEvent(buffer)).toMatchObject({
      timestamp: 1005,
      durationMs: 5,
      meta: { name: "insertText" },
    });
  });

  test("record pushes a zero-duration event when durationMs is omitted", () => {
    clock.advance(3);
    collector.record("intent", { name: "insertText" });

    const buffer = collector.getBuffer("intent");
    expect(buffer.size).toBe(1);
    expect(newestEvent(buffer)).toMatchObject({
      timestamp: 1003,
      durationMs: 0,
      meta: { name: "insertText" },
    });
  });

  test("record without meta uses an empty meta object", () => {
    collector.record("intent");
    expect(newestEvent(collector.getBuffer("intent")).meta).toEqual({});
  });

  test("ring buffer wraps at capacity, overwriting oldest entries", () => {
    const small = createDiagnosticsCollector({ clock: clock.now, capacity: 4 });
    for (let i = 0; i < 6; i++) {
      clock.set(2000 + i);
      small.record("intent", { i });
    }

    const buffer = small.getBuffer("intent");
    expect(buffer.capacity).toBe(4);
    expect(buffer.size).toBe(4);

    // After 6 writes into a capacity-4 buffer, the earliest two writes
    // (i=0,1) have been overwritten by i=4,5. Assert via newest/oldest
    // helpers rather than poking at slot indices directly.
    expect(oldestEvent(buffer).meta).toEqual({ i: 2 });
    expect(newestEvent(buffer).meta).toEqual({ i: 5 });
  });

  test("default capacity is the documented buffer size", () => {
    expect(collector.getBuffer("intent").capacity).toBe(DIAGNOSTICS_BUFFER_CAPACITY);
  });

  test("getBuffer returns the correct buffer per stage", () => {
    for (const stage of DIAGNOSTICS_STAGES) {
      collector.record(stage, { stage });
    }
    for (const stage of DIAGNOSTICS_STAGES) {
      const buffer = collector.getBuffer(stage);
      expect(buffer.size).toBe(1);
      expect(newestEvent(buffer).meta).toEqual({ stage });
    }
  });

  test("buffers are independent per stage", () => {
    collector.record("intent");
    collector.record("intent");
    collector.record("paint");

    expect(collector.getBuffer("intent").size).toBe(2);
    expect(collector.getBuffer("paint").size).toBe(1);
    expect(collector.getBuffer("command").size).toBe(0);
  });

  test("defaults to performance.now when no clock is injected", () => {
    const real = createDiagnosticsCollector();
    real.record("command");
    const buffer = real.getBuffer("command");
    expect(buffer.size).toBe(1);
    expect(newestEvent(buffer).timestamp).toBeGreaterThanOrEqual(0);
  });
});
