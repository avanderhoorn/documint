import { Window } from "happy-dom";

const happyWindow = new Window();
const originalGlobals = new Map<string, unknown>();
const globalProps = [
  "document",
  "HTMLElement",
  "HTMLDivElement",
  "MutationObserver",
  "navigator",
  "customElements",
  "window",
] as const;

for (const prop of globalProps) {
  // @ts-ignore — patching globalThis for DOM environment
  originalGlobals.set(prop, globalThis[prop]);
  // @ts-ignore — patching globalThis for DOM environment
  globalThis[prop] = prop === "window" ? happyWindow : happyWindow[prop];
}
// React needs IS_REACT_ACT_ENVIRONMENT to suppress act() warnings in tests.
// @ts-expect-error — React test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { type Root, createRoot } from "react-dom/client";
import { act } from "react";
import { createDiagnosticsCollector } from "../../../src/diagnostics";
import type { DiagnosticsCollector } from "../../../src/diagnostics";
import { EMPTY_SNAPSHOT, type DiagnosticsSnapshot } from "../../../src/diagnostics/snapshot";
import { useDiagnostics } from "../../../src/diagnostics/hooks/useDiagnostics";

afterAll(() => {
  for (const [prop, value] of originalGlobals) {
    // @ts-ignore — restoring globalThis
    globalThis[prop] = value;
  }
});

let activeRoot: Root | null = null;
let activeContainer: HTMLDivElement | null = null;

afterEach(() => {
  if (activeRoot) {
    act(() => activeRoot!.unmount());
    activeRoot = null;
  }
  activeContainer?.remove();
  activeContainer = null;
});

// Test harness: a component that calls `useDiagnostics` and pushes every
// rendered snapshot into the supplied array. Lets tests inspect both the
// current value and identity stability across renders.
type HarnessProps = {
  collector: DiagnosticsCollector | undefined;
  timeRange: number;
  sink: DiagnosticsSnapshot[];
};

function Harness({ collector, timeRange, sink }: HarnessProps): null {
  const snapshot = useDiagnostics(collector, timeRange);
  sink.push(snapshot);
  return null;
}

function mount(props: HarnessProps): Root {
  const container = document.createElement("div");
  document.body.appendChild(container);
  activeContainer = container;
  const root = createRoot(container);
  activeRoot = root;
  act(() => {
    root.render(createElement(Harness, props));
  });
  return root;
}

function rerender(root: Root, props: HarnessProps) {
  act(() => {
    root.render(createElement(Harness, props));
  });
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("useDiagnostics", () => {
  test("returns EMPTY_SNAPSHOT when collector is undefined", () => {
    const sink: DiagnosticsSnapshot[] = [];
    mount({ collector: undefined, timeRange: 5, sink });

    // The harness records EMPTY_SNAPSHOT on the initial render. Since there
    // is no collector, the polling effect short-circuits and no further
    // snapshot is produced.
    expect(sink[sink.length - 1]).toBe(EMPTY_SNAPSHOT);
  });

  test("computes a populated snapshot for a non-empty collector after mount", () => {
    const collector = createDiagnosticsCollector();
    collector.record("paint", { tier: "content" }, 5);
    collector.record("paint", { tier: "viewport" }, 8);
    collector.record("intent", { name: "type" }, 0);

    const sink: DiagnosticsSnapshot[] = [];
    mount({ collector, timeRange: 5, sink });

    const snap = sink[sink.length - 1];
    expect(snap).not.toBe(EMPTY_SNAPSHOT);
    expect(snap.paint.count).toBe(2);
    expect(snap.paint.relayoutRepaint).toBe(1);
    expect(snap.paint.repaintOnly).toBe(1);
    expect(snap.intent.count).toBe(1);
  });

  test("returns EMPTY_SNAPSHOT after the collector is removed (panel closed)", () => {
    const collector = createDiagnosticsCollector();
    collector.record("paint", { tier: "content" }, 5);

    const sink: DiagnosticsSnapshot[] = [];
    const root = mount({ collector, timeRange: 5, sink });
    expect(sink[sink.length - 1].paint.count).toBe(1);

    rerender(root, { collector: undefined, timeRange: 5, sink });
    expect(sink[sink.length - 1]).toBe(EMPTY_SNAPSHOT);
  });

  test("recomputes immediately when timeRange changes (does not wait for next poll tick)", () => {
    // Place an event at t=0 with the test clock; with timeRange=5s the
    // event is in window, with a tiny window the now drift drops it.
    let now = 0;
    const collector = createDiagnosticsCollector({ clock: () => now });
    collector.record("paint", { tier: "content" }, 5);

    // Advance the test clock so the event is in the past relative to the
    // collector's own clock too.
    now = 1000;

    const sink: DiagnosticsSnapshot[] = [];
    const root = mount({ collector, timeRange: 5, sink });
    const wide = sink[sink.length - 1];
    expect(wide.paint.count).toBe(1);

    // Re-render with a tiny window. Because performance.now() (used inside
    // useDiagnostics for the snapshot's `now`) is well past the event's
    // recorded timestamp of 0, narrowing the window drops it.
    rerender(root, { collector, timeRange: 0.001, sink });

    const narrow = sink[sink.length - 1];
    expect(narrow.paint.count).toBe(0);
    // The change must arrive synchronously — without waiting 500ms — so the
    // panel reflects a UI control change immediately.
    expect(narrow).not.toBe(wide);
  });

  test("polls the collector and emits a new snapshot when buffer content changes", async () => {
    const collector = createDiagnosticsCollector();
    const sink: DiagnosticsSnapshot[] = [];
    mount({ collector, timeRange: 5, sink });

    const initial = sink[sink.length - 1];
    expect(initial.paint.count).toBe(0);

    // Append events directly to the collector; no React state change triggers
    // a render — the next poll tick must surface them.
    collector.record("paint", { tier: "content" }, 1);
    collector.record("paint", { tier: "content" }, 1);

    await act(async () => {
      await wait(600);
    });

    const after = sink[sink.length - 1];
    expect(after.paint.count).toBe(2);
    expect(after).not.toBe(initial);
  });

  test("returns the same snapshot reference across polls when nothing changed", async () => {
    const collector = createDiagnosticsCollector();
    collector.record("paint", { tier: "content" }, 1);

    const sink: DiagnosticsSnapshot[] = [];
    mount({ collector, timeRange: 5, sink });

    const before = sink[sink.length - 1];
    expect(before.paint.count).toBe(1);
    const renderCountBefore = sink.length;

    // Wait long enough for at least one poll tick. With no new events the
    // hook should detect equality and skip setSnapshot, so no re-render.
    await act(async () => {
      await wait(700);
    });

    expect(sink[sink.length - 1]).toBe(before);
    expect(sink.length).toBe(renderCountBefore);
  });

  test("emits a single fresh snapshot per change even after many identity-equal polls", async () => {
    // Records-then-no-records: the first poll after recording surfaces the
    // event; subsequent polls must not produce new snapshot identities while
    // the buffer is quiescent.
    const collector = createDiagnosticsCollector();
    const sink: DiagnosticsSnapshot[] = [];
    mount({ collector, timeRange: 5, sink });

    collector.record("transaction", { name: "replace-block" }, 2);
    await act(async () => {
      await wait(600);
    });
    const afterFirst = sink[sink.length - 1];
    expect(afterFirst.command.replaceBlock).toBe(1);

    // No more events; wait through another two poll ticks.
    await act(async () => {
      await wait(1100);
    });

    expect(sink[sink.length - 1]).toBe(afterFirst);
  });
});
