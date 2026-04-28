import { describe, expect, test } from "bun:test";
import { createDiagnosticsCollector } from "../../src/diagnostics";
import { computeSnapshot, EMPTY_SNAPSHOT } from "../../src/diagnostics/snapshot";

function createTestClock(start = 0) {
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

function setup(start = 0) {
  const clock = createTestClock(start);
  const collector = createDiagnosticsCollector({ clock: clock.now });
  return { clock, collector };
}

describe("computeSnapshot", () => {
  test("returns empty snapshot for a fresh collector with no events", () => {
    const { collector } = setup();
    const snap = computeSnapshot(collector, 5000, 0);
    expect(snap.intent.count).toBe(0);
    expect(snap.intent.status).toBe("idle");
    expect(snap.parse.count).toBe(0);
    expect(snap.command.count).toBe(0);
    expect(snap.transaction.count).toBe(0);
    expect(snap.viewport.count).toBe(0);
    expect(snap.paint.count).toBe(0);
    expect(snap.overlay.count).toBe(0);
    expect(snap.serialize.count).toBe(0);
  });

  test("returns correct count/p50/p99 for populated buffers", () => {
    const { clock, collector } = setup(100);

    // Record 3 command events with durations 2, 4, 6
    for (const dur of [2, 4, 6]) {
      clock.advance(dur);
      collector.record("command", { name: "insertText" }, dur);
    }

    const snap = computeSnapshot(collector, 5000, clock.now());
    expect(snap.command.count).toBe(3);
    expect(snap.command.p50).toBe(4);
    expect(snap.command.p99).toBe(6);
    expect(snap.command.status).toBe("active");
  });

  test("respects timeRange — excludes events outside the window", () => {
    const { clock, collector } = setup(0);

    clock.set(100);
    collector.record("intent", { name: "insertText" });
    clock.set(500);
    collector.record("intent", { name: "deleteBackward" });
    clock.set(900);
    collector.record("intent", { name: "undo" });

    // Window [600, 1000] at now=1000, range=400ms
    const snap = computeSnapshot(collector, 400, 1000);
    expect(snap.intent.count).toBe(1);
    expect(snap.intent.groupedOps[0]?.label).toBe("undo");
  });

  test("run-length groups consecutive identical intent operations", () => {
    const { clock, collector } = setup(0);

    // Newest first: insertText, insertText, moveCaretHorizontally, insertText
    clock.set(100);
    collector.record("intent", { name: "insertText" });
    clock.set(200);
    collector.record("intent", { name: "moveCaretHorizontally" });
    clock.set(300);
    collector.record("intent", { name: "insertText" });
    clock.set(400);
    collector.record("intent", { name: "insertText" });

    const snap = computeSnapshot(collector, 5000, 500);
    // Newest first: 2x insertText, 1x moveCaretHorizontally, 1x insertText
    expect(snap.intent.groupedOps).toEqual([
      { label: "insertText", count: 2 },
      { label: "moveCaretHorizontally", count: 1 },
      { label: "insertText", count: 1 },
    ]);
  });

  test("transaction kind breakdown counts match buffer contents", () => {
    const { clock, collector } = setup(0);

    clock.set(101);
    collector.record("transaction", { name: "replace-block" }, 1);

    clock.set(201);
    collector.record("transaction", { name: "replace-root" }, 1);

    clock.set(301);
    collector.record("transaction", { name: "replace-block" }, 1);

    clock.set(401);
    collector.record("transaction", { name: "replace-selection" }, 1);

    const snap = computeSnapshot(collector, 5000, 500);
    expect(snap.command.replaceBlock).toBe(2);
    expect(snap.command.replaceRoot).toBe(1);
    expect(snap.command.replaceRootRange).toBe(0);
    expect(snap.command.replaceSelectionText).toBe(1);
  });

  test("render tier breakdown maps viewport → RR and content → R", () => {
    const { clock, collector } = setup(0);

    clock.set(101);
    collector.record("paint", { tier: "viewport" }, 1);

    clock.set(201);
    collector.record("paint", { tier: "content" }, 1);

    clock.set(301);
    collector.record("paint", { tier: "viewport" }, 1);

    clock.set(401);
    collector.record("paint", { tier: "content" }, 1);

    clock.set(501);
    collector.record("paint", { tier: "content" }, 1);

    const snap = computeSnapshot(collector, 5000, 600);
    expect(snap.paint.relayoutRepaint).toBe(2);
    expect(snap.paint.repaintOnly).toBe(3);
  });

  test("latestViewport reflects the most recent viewport event in the buffer", () => {
    const { clock, collector } = setup(0);

    clock.set(101);
    collector.record("viewport", { laidOut: 10, total: 200 }, 1);

    clock.set(201);
    collector.record("viewport", { laidOut: 15, total: 340 }, 1);

    const snap = computeSnapshot(collector, 5000, 300);
    expect(snap.latestViewport.laidOut).toBe(15);
    expect(snap.latestViewport.total).toBe(340);
    // viewport aggregate (rolling-window) keeps its rate metrics; the
    // virtualization counts no longer live there.
    expect(snap.viewport.count).toBe(2);
  });

  test("serialize delta returns the latest delta value within window", () => {
    const { clock, collector } = setup(0);

    clock.set(101);
    collector.record("serialize", { deltaChars: 42 }, 1);

    clock.set(201);
    collector.record("serialize", { deltaChars: -7 }, 1);

    const snap = computeSnapshot(collector, 5000, 300);
    expect(snap.serialize.deltaChars).toBe(-7);
  });

  test("per-stage status is idle when count is 0 and active otherwise", () => {
    const { clock, collector } = setup(0);

    clock.set(100);
    collector.record("intent", { name: "insertText" });
    clock.set(101);
    collector.record("command", { name: "insertText" }, 1);

    const snap = computeSnapshot(collector, 5000, 200);
    expect(snap.intent.status).toBe("active");
    expect(snap.command.status).toBe("active");
    expect(snap.parse.status).toBe("idle");
    expect(snap.transaction.status).toBe("idle");
    expect(snap.viewport.status).toBe("idle");
    expect(snap.paint.status).toBe("idle");
    expect(snap.overlay.status).toBe("idle");
    expect(snap.serialize.status).toBe("idle");
  });

  test("EMPTY_SNAPSHOT is fully frozen and reusable", () => {
    expect(Object.isFrozen(EMPTY_SNAPSHOT)).toBe(true);
    expect(Object.isFrozen(EMPTY_SNAPSHOT.intent)).toBe(true);
    expect(Object.isFrozen(EMPTY_SNAPSHOT.intent.groupedOps)).toBe(true);
    expect(EMPTY_SNAPSHOT.intent.count).toBe(0);
    expect(EMPTY_SNAPSHOT.parse.status).toBe("idle");
  });

  test("paintsPerSecond ignores paint events older than 1 second even when timeRange is wider", () => {
    const { clock, collector } = setup(0);

    // Two old paint events outside the 1s window but inside the timeRange.
    clock.set(100);
    collector.record("paint", { tier: "content" }, 1);
    clock.set(500);
    collector.record("paint", { tier: "content" }, 1);

    // Three recent paint events inside the 1s window.
    clock.set(2500);
    collector.record("paint", { tier: "content" }, 1);
    clock.set(2700);
    collector.record("paint", { tier: "content" }, 1);
    clock.set(3000);
    collector.record("paint", { tier: "content" }, 1);

    // Window [2000, 3000] for paintsPerSecond; window [-7000, 3000] for the
    // overall paint aggregate.
    const snap = computeSnapshot(collector, 10_000, 3000);
    expect(snap.paint.count).toBe(5);
    expect(snap.paintsPerSecond).toBe(3);
  });

  test("latestViewport persists across narrow windows (current state, not windowed)", () => {
    const { clock, collector } = setup(0);

    // Record well outside what the snapshot window will cover.
    clock.set(100);
    collector.record("viewport", { laidOut: 9, total: 99 }, 1);

    // Window [9000, 10_000] excludes the only event for the rolling viewport
    // aggregate, but `latestViewport` is current document state and must
    // keep the last known counts regardless of window.
    const snap = computeSnapshot(collector, 1000, 10_000);
    expect(snap.viewport.count).toBe(0);
    expect(snap.latestViewport.laidOut).toBe(9);
    expect(snap.latestViewport.total).toBe(99);
  });

  test("latestViewport defaults to 0/0 before any viewport event is recorded", () => {
    const { collector } = setup(0);
    // No viewport events recorded.
    const snap = computeSnapshot(collector, 5000, 1000);
    expect(snap.latestViewport.laidOut).toBe(0);
    expect(snap.latestViewport.total).toBe(0);
  });

  test("latestViewport always reads the buffer's newest event regardless of timestamp position", () => {
    const { clock, collector } = setup(0);

    clock.set(500);
    collector.record("viewport", { laidOut: 7, total: 70 }, 1);

    // A subsequent event recorded "after now" — with rolling-window
    // semantics this would be excluded, but `latestViewport` is current
    // document state and the buffer's newest entry always wins.
    clock.set(2000);
    collector.record("viewport", { laidOut: 99, total: 999 }, 1);

    const snap = computeSnapshot(collector, 5000, 1000);
    expect(snap.latestViewport.laidOut).toBe(99);
    expect(snap.latestViewport.total).toBe(999);
  });

  test("serialize delta falls back to zero when no serialize events lie in the window", () => {
    const { clock, collector } = setup(0);

    clock.set(100);
    collector.record("serialize", { deltaChars: 42 }, 1);

    // Window [9000, 10_000] excludes the only event.
    const snap = computeSnapshot(collector, 1000, 10_000);
    expect(snap.serialize.count).toBe(0);
    expect(snap.serialize.deltaChars).toBe(0);
  });

  test("paint tier breakdown ignores events with unknown tier metadata", () => {
    const { clock, collector } = setup(0);

    clock.set(100);
    collector.record("paint", { tier: "viewport" }, 1);
    clock.set(200);
    collector.record("paint", { tier: "content" }, 1);
    clock.set(300);
    collector.record("paint", { tier: "mystery" }, 1); // unknown — ignored
    clock.set(400);
    collector.record("paint", undefined, 1); // missing tier — ignored

    const snap = computeSnapshot(collector, 5000, 500);
    expect(snap.paint.count).toBe(4);
    expect(snap.paint.relayoutRepaint).toBe(1);
    expect(snap.paint.repaintOnly).toBe(1);
  });

  test("input groupedOps is an empty array when no input events fall in the window", () => {
    const { clock, collector } = setup(0);

    clock.set(100);
    collector.record("intent", { name: "insertText" });

    // Window [9000, 10_000] excludes the only event.
    const snap = computeSnapshot(collector, 1000, 10_000);
    expect(snap.intent.count).toBe(0);
    expect(snap.intent.groupedOps).toEqual([]);
  });

  test("input events with missing name fall back to the 'unknown' label", () => {
    const { clock, collector } = setup(0);

    clock.set(100);
    collector.record("intent"); // no meta at all
    clock.set(200);
    collector.record("intent", {}); // meta object without name

    const snap = computeSnapshot(collector, 5000, 300);
    expect(snap.intent.count).toBe(2);
    // Both events lack a name and are consecutive → run-length-merged.
    expect(snap.intent.groupedOps).toEqual([{ label: "unknown", count: 2 }]);
  });

  test("input groupedOps initializes the run for a single-event window", () => {
    const { clock, collector } = setup(0);

    clock.set(100);
    collector.record("intent", { name: "insertText" });

    const snap = computeSnapshot(collector, 5000, 200);
    expect(snap.intent.count).toBe(1);
    expect(snap.intent.groupedOps).toEqual([{ label: "insertText", count: 1 }]);
  });

  test("paint breakdown stays consistent with paint.count after wrap-around", () => {
    const clock = createTestClock(0);
    const collector = createDiagnosticsCollector({ clock: clock.now, capacity: 4 });

    // Six writes into a capacity-4 buffer. The newest 4 survive (tiers
    // viewport, content, viewport, content). The wrap is the interesting
    // bit: the snapshot's paint walk and aggregateBuffer's walk both have
    // to handle the same wrapped layout, and their counts must agree.
    clock.set(100);
    collector.record("paint", { tier: "content" }, 1); // dropped on wrap
    clock.set(200);
    collector.record("paint", { tier: "viewport" }, 1); // dropped on wrap
    clock.set(300);
    collector.record("paint", { tier: "viewport" }, 1);
    clock.set(400);
    collector.record("paint", { tier: "content" }, 1);
    clock.set(500);
    collector.record("paint", { tier: "viewport" }, 1);
    clock.set(600);
    collector.record("paint", { tier: "content" }, 1);

    const snap = computeSnapshot(collector, 5000, 700);
    expect(snap.paint.count).toBe(4);
    expect(snap.paint.relayoutRepaint).toBe(2);
    expect(snap.paint.repaintOnly).toBe(2);
  });

  test("paint.count equals the sum of all tier buckets plus unknown-tier events", () => {
    const { clock, collector } = setup(0);

    // Mix of known and unknown tiers — paint.count must always equal the
    // total events in the window, even though only known tiers contribute
    // to the breakdown buckets.
    clock.set(100);
    collector.record("paint", { tier: "viewport" }, 1);
    clock.set(200);
    collector.record("paint", { tier: "content" }, 1);
    clock.set(300);
    collector.record("paint", { tier: "content" }, 1);
    clock.set(400);
    collector.record("paint", { tier: "mystery" }, 1);
    clock.set(500);
    collector.record("paint", undefined, 1);

    const snap = computeSnapshot(collector, 5000, 600);
    const bucketed = snap.paint.relayoutRepaint + snap.paint.repaintOnly;
    expect(snap.paint.count).toBe(5);
    expect(bucketed).toBe(3);
    // Invariant: count is bounded below by the bucket sum and above by the
    // total — anything else means the breakdown walk diverged from the
    // aggregate walk.
    expect(snap.paint.count).toBeGreaterThanOrEqual(bucketed);
  });

  test("transaction kind breakdown ignores events with unknown name metadata", () => {
    const { clock, collector } = setup(0);

    clock.set(101);
    collector.record("transaction", { name: "replace-block" }, 1);
    clock.set(201);
    collector.record("transaction", { name: "something-new" }, 1); // unknown
    clock.set(301);
    collector.record("transaction", undefined, 1); // missing name

    const snap = computeSnapshot(collector, 5000, 400);
    expect(snap.transaction.count).toBe(3);
    expect(snap.command.replaceBlock).toBe(1);
    expect(snap.command.replaceRoot).toBe(0);
    expect(snap.command.replaceRootRange).toBe(0);
    expect(snap.command.replaceSelectionText).toBe(0);
  });
});
