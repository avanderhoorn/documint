import { describe, expect, test } from "bun:test";
import { createDiagnosticsCollector } from "../../src/diagnostics";
import { aggregateBuffer, iterateBufferInWindow } from "../../src/diagnostics/aggregation";
import type { StageEvent } from "../../src/diagnostics/types";

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

describe("aggregateBuffer", () => {
  test("returns zeros for an empty buffer", () => {
    const collector = createDiagnosticsCollector();
    expect(aggregateBuffer(collector.getBuffer("command"), 1000, 0)).toEqual({
      count: 0,
      p50: 0,
      p99: 0,
    });
  });

  test("computes count within the time window and excludes older events", () => {
    const clock = createTestClock(0);
    const collector = createDiagnosticsCollector({ clock: clock.now });

    // Three events at t=0, t=500, t=1500
    collector.record("intent");
    clock.set(500);
    collector.record("intent");
    clock.set(1500);
    collector.record("intent");

    // At now=2000 with timeRange=1000ms, only events at t≥1000 count.
    const result = aggregateBuffer(collector.getBuffer("intent"), 1000, 2000);
    expect(result.count).toBe(1);
  });

  test("computes p50 and p99 with nearest-rank percentile", () => {
    const clock = createTestClock(0);
    const collector = createDiagnosticsCollector({ clock: clock.now });

    // Durations: 1, 2, 3, ..., 100
    for (let i = 1; i <= 100; i++) {
      clock.advance(i);
      collector.record("paint", undefined, i);
    }

    const result = aggregateBuffer(collector.getBuffer("paint"), 1_000_000, clock.now());
    expect(result.count).toBe(100);
    // Nearest-rank: p50 → ceil(0.5*100)=50 → durations[49] = 50
    expect(result.p50).toBe(50);
    // Nearest-rank: p99 → ceil(0.99*100)=99 → durations[98] = 99
    expect(result.p99).toBe(99);
  });

  test("handles single-event buffers", () => {
    const clock = createTestClock(0);
    const collector = createDiagnosticsCollector({ clock: clock.now });
    clock.advance(7);
    collector.record("paint", undefined, 7);

    const result = aggregateBuffer(collector.getBuffer("paint"), 1000, clock.now());
    expect(result).toEqual({ count: 1, p50: 7, p99: 7 });
  });

  test("handles wrapped ring buffers with all entries inside the window", () => {
    const clock = createTestClock(0);
    const collector = createDiagnosticsCollector({ clock: clock.now, capacity: 4 });

    // Six writes into a capacity-4 buffer: durations 1..6, only 3..6 survive.
    for (let i = 1; i <= 6; i++) {
      clock.advance(i);
      collector.record("command", undefined, i);
    }

    const result = aggregateBuffer(collector.getBuffer("command"), 1_000_000, clock.now());
    expect(result.count).toBe(4);
    // Surviving durations: [3, 4, 5, 6]
    // p50 → ceil(0.5*4)=2 → sorted[1] = 4
    expect(result.p50).toBe(4);
    // p99 → ceil(0.99*4)=4 → sorted[3] = 6
    expect(result.p99).toBe(6);
  });

  test("handles wrapped ring buffers where the time window spans the wrap point", () => {
    const clock = createTestClock(0);
    const collector = createDiagnosticsCollector({ clock: clock.now, capacity: 4 });

    // Write 6 events at timestamps 0, 100, 200, 300, 400, 500 with duration=1.
    // After wrap, surviving events have timestamps [200, 300, 400, 500].
    // Physical layout in events[]: head ends at 2.
    //   events[0] = ts 400  events[1] = ts 500
    //   events[2] = ts 200  events[3] = ts 300
    // The window [350, 550] selects ts 400, 500 — these straddle the wrap
    // (one before, one after head).
    for (let i = 0; i < 6; i++) {
      clock.set(i * 100 + 1);
      // duration=1 so each event has the same value
      collector.record("viewport", undefined, 1);
    }

    const result = aggregateBuffer(collector.getBuffer("viewport"), 200, 550);
    expect(result.count).toBe(2);
    expect(result.p50).toBe(1);
    expect(result.p99).toBe(1);
  });

  test("includes long-running events that started before the window but finished inside it", () => {
    const clock = createTestClock(0);
    const collector = createDiagnosticsCollector({ clock: clock.now });

    // Event recorded at completion (ts=1200) with full duration (1200ms).
    clock.set(1200);
    collector.record("paint", undefined, 1200);

    // Window: now=1200, range=500 → [700, 1200]. Event finished at 1200,
    // started at 0. The fix records the completion time, so it's included.
    const result = aggregateBuffer(collector.getBuffer("paint"), 500, 1200);
    expect(result.count).toBe(1);
    expect(result.p50).toBe(1200);
    expect(result.p99).toBe(1200);
  });

  test("excludes events with timestamps newer than now", () => {
    const clock = createTestClock(0);
    const collector = createDiagnosticsCollector({ clock: clock.now });

    clock.set(1000);
    collector.record("intent");
    clock.set(2000);
    collector.record("intent");

    // Aggregating "as of now=1500" should only include the t=1000 event,
    // not the future t=2000 one.
    const result = aggregateBuffer(collector.getBuffer("intent"), 1000, 1500);
    expect(result.count).toBe(1);
  });

  test("returns a frozen empty result for empty buffers", () => {
    const collector = createDiagnosticsCollector();
    const a = aggregateBuffer(collector.getBuffer("command"), 1000, 0);
    const b = aggregateBuffer(collector.getBuffer("paint"), 1000, 0);
    // Either the same sentinel or two equivalent frozen empties is fine —
    // callers only depend on the shape, not on identity.
    expect(a).toEqual(b);
    expect(a.count).toBe(0);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(b)).toBe(true);
  });

  test("includes events at the exact window boundaries (inclusive on both ends)", () => {
    const clock = createTestClock(0);
    const collector = createDiagnosticsCollector({ clock: clock.now });

    // Three events: one before the window, one exactly at the lower edge,
    // one exactly at `now` (upper edge).
    clock.set(499);
    collector.record("intent", undefined, 1); // outside (before)
    clock.set(500);
    collector.record("intent", undefined, 1); // exactly at lower edge
    clock.set(1500);
    collector.record("intent", undefined, 1); // exactly at now

    // Window: now=1500, range=1000 → [500, 1500]. Both edges included.
    const result = aggregateBuffer(collector.getBuffer("intent"), 1000, 1500);
    expect(result.count).toBe(2);
  });
});

// `iterateBufferInWindow` is the shared walker that powers both
// `aggregateBuffer` and the per-stage breakdown helpers in `snapshot.ts`. Its
// iteration order (newest → oldest) and inclusive-window contract are part
// of the public API.
describe("iterateBufferInWindow", () => {
  test("invokes the visitor newest-first", () => {
    const clock = createTestClock(0);
    const collector = createDiagnosticsCollector({ clock: clock.now });

    clock.set(100);
    collector.record("intent", { name: "first" }, 0);
    clock.set(200);
    collector.record("intent", { name: "second" }, 0);
    clock.set(300);
    collector.record("intent", { name: "third" }, 0);

    const seen: string[] = [];
    iterateBufferInWindow(collector.getBuffer("intent"), 1000, 500, (event) => {
      seen.push(event.meta.name as string);
    });

    expect(seen).toEqual(["third", "second", "first"]);
  });

  test("includes events at exactly the window boundaries", () => {
    const clock = createTestClock(0);
    const collector = createDiagnosticsCollector({ clock: clock.now });

    clock.set(499);
    collector.record("paint", { tier: "content" }, 0); // outside (before)
    clock.set(500);
    collector.record("paint", { tier: "content" }, 0); // exactly at lower edge
    clock.set(1500);
    collector.record("paint", { tier: "content" }, 0); // exactly at now (upper edge)

    let count = 0;
    iterateBufferInWindow(collector.getBuffer("paint"), 1000, 1500, () => {
      count++;
    });
    expect(count).toBe(2);
  });

  test("does not invoke the visitor for an empty buffer", () => {
    const collector = createDiagnosticsCollector();
    let invoked = false;
    iterateBufferInWindow(collector.getBuffer("command"), 1000, 0, () => {
      invoked = true;
    });
    expect(invoked).toBe(false);
  });

  test("walks correctly across a wrapped ring buffer", () => {
    const clock = createTestClock(0);
    // Tiny capacity forces wrap-around after 4 writes.
    const collector = createDiagnosticsCollector({ clock: clock.now, capacity: 3 });

    // Write 5 events; the buffer should retain the last 3 (timestamps 300/400/500).
    for (let i = 1; i <= 5; i++) {
      clock.set(i * 100);
      collector.record("intent", { name: `e${i}` }, 0);
    }

    const seen: string[] = [];
    iterateBufferInWindow(collector.getBuffer("intent"), 10_000, 1000, (event) => {
      seen.push(event.meta.name as string);
    });

    // Newest-first: e5 (t=500), e4 (t=400), e3 (t=300). e1/e2 were overwritten.
    expect(seen).toEqual(["e5", "e4", "e3"]);
  });

  test("excludes events with timestamps newer than now", () => {
    const clock = createTestClock(0);
    const collector = createDiagnosticsCollector({ clock: clock.now });

    clock.set(500);
    collector.record("intent", { name: "past" }, 0);
    clock.set(2000);
    collector.record("intent", { name: "future" }, 0);

    const seen: string[] = [];
    iterateBufferInWindow(collector.getBuffer("intent"), 10_000, 1000, (event) => {
      seen.push(event.meta.name as string);
    });

    // The "future" event (t=2000) is past now=1000 and must be skipped.
    expect(seen).toEqual(["past"]);
  });

  test("passes the underlying StageEvent reference through to the visitor", () => {
    const clock = createTestClock(0);
    const collector = createDiagnosticsCollector({ clock: clock.now });

    clock.set(100);
    collector.record("paint", { tier: "viewport" }, 7.5);

    const visited: StageEvent[] = [];
    iterateBufferInWindow(collector.getBuffer("paint"), 1000, 200, (event) => {
      visited.push(event);
    });

    expect(visited).toHaveLength(1);
    expect(visited[0].timestamp).toBe(100);
    expect(visited[0].durationMs).toBe(7.5);
    expect(visited[0].meta).toEqual({ tier: "viewport" });
  });
});
