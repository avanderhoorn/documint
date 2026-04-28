// Unit tests for the lifecycle event bus. Verifies that `emitLifecycle` and
// `measureLifecycle` reach `subscribeLifecycle` handlers via the shared
// `documint:diagnostic` window bus, and that `subscribeLifecycle` returns a
// working unsubscribe.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  emitLifecycle,
  measureLifecycle,
  subscribeLifecycle,
  type LifecycleEvent,
} from "@/lifecycle";

// `window` is undefined in `bun:test`. Install a minimal `EventTarget` so
// `emitLifecycle` can dispatch to it. `CustomEvent` and `EventTarget` are
// available globally in Bun.
let installedWindow = false;
beforeAll(() => {
  if (typeof (globalThis as { window?: unknown }).window === "undefined") {
    (globalThis as { window: EventTarget }).window = new EventTarget();
    installedWindow = true;
  }
});
afterAll(() => {
  if (installedWindow) delete (globalThis as { window?: unknown }).window;
});

let events: LifecycleEvent[];
let unsubscribe: (() => void) | undefined;

beforeEach(() => {
  unsubscribe?.();
  events = [];
  unsubscribe = subscribeLifecycle((event) => events.push(event));
});

describe("lifecycle bus", () => {
  test("emitLifecycle dispatches to subscribers", () => {
    emitLifecycle({ type: "intent", name: "test" });
    expect(events).toHaveLength(1);
    const first = events[0];
    if (first?.type !== "intent") throw new Error("unreachable");
    expect(first.name).toBe("test");
  });

  test("measureLifecycle emits a timed event and returns the function result", () => {
    const result = measureLifecycle(
      () => 42,
      { type: "command", name: "answer" },
    );
    expect(result).toBe(42);
    expect(events).toHaveLength(1);
    const first = events[0];
    if (first?.type !== "command") throw new Error("unreachable");
    expect(first.name).toBe("answer");
    expect(first.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("subscribeLifecycle's unsubscribe stops further events", () => {
    unsubscribe?.();
    unsubscribe = undefined;
    emitLifecycle({ type: "intent", name: "after-unsubscribe" });
    expect(events).toHaveLength(0);
  });
});
