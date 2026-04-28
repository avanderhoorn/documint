// Lifecycle event integration tests for the editor and command-instrumentation
// surface. The editor module owns `transaction` events (emitted from
// `dispatch` for any mutating action). The component-layer `instrumentedCommands`
// shim owns `command` events. Both flow through the shared
// `documint:diagnostic` window bus under `kind: "lifecycle:<type>"`.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  createEditorState,
  insertText,
  redo,
  setSelection,
  undo,
} from "@/editor";
import { instrumentedCommands } from "../../src/component/lib/instrument-commands";
import { subscribeLifecycle, type LifecycleEvent } from "@/lifecycle";
import { parseMarkdown } from "@/markdown";

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

function setup() {
  const document = parseMarkdown("hello world\n");
  const state = createEditorState(document);
  return { commands: instrumentedCommands, state };
}

const commandEvents = (es: LifecycleEvent[]) => es.filter((e) => e.type === "command");
const transactionEvents = (es: LifecycleEvent[]) => es.filter((e) => e.type === "transaction");

describe("editor lifecycle subscription", () => {
  test("createEditorState requires only a Document", () => {
    const document = parseMarkdown("test\n");
    const state = createEditorState(document);
    const result = insertText(state, "x");
    expect(result).not.toBeNull();
    expect(result).not.toBe(state);
  });

  test("instrumented command emits a command event", () => {
    const { commands, state } = setup();
    commands.insertText(state, "x");

    const cmds = commandEvents(events);
    expect(cmds.length).toBeGreaterThanOrEqual(1);
    const first = cmds[0];
    if (first.type !== "command") throw new Error("unreachable");
    expect(first.durationMs).toBeGreaterThanOrEqual(0);
    expect(first.name).toBe("insertText");
  });

  test("dispatch emits a transaction event with the action kind", () => {
    const { state } = setup();
    insertText(state, "x");

    const transactions = transactionEvents(events);
    expect(transactions.length).toBeGreaterThanOrEqual(1);
    const first = transactions[0];
    if (first.type !== "transaction") throw new Error("unreachable");
    expect([
      "replace-block",
      "replace-root",
      "replace-root-range",
      "replace-selection",
    ]).toContain(first.name);
  });

  test("undo and redo do not emit transaction events", () => {
    const { state } = setup();

    const afterInsert = insertText(state, "x");
    expect(afterInsert).not.toBeNull();
    const txAfterInsert = transactionEvents(events).length;
    expect(txAfterInsert).toBeGreaterThanOrEqual(1);

    const afterUndo = undo(afterInsert!);
    expect(afterUndo).not.toBeNull();
    expect(transactionEvents(events).length).toBe(txAfterInsert);

    redo(afterUndo!);
    expect(transactionEvents(events).length).toBe(txAfterInsert);
  });

  test("instrumented undo/redo still emit command events", () => {
    const { commands, state } = setup();
    const afterInsert = commands.insertText(state, "x");
    expect(afterInsert).not.toBeNull();

    const commandBefore = commandEvents(events).length;

    const afterUndo = commands.undo(afterInsert!);
    expect(afterUndo).not.toBeNull();
    expect(commandEvents(events).length).toBe(commandBefore + 1);

    commands.redo(afterUndo!);
    expect(commandEvents(events).length).toBe(commandBefore + 2);
  });

  test("comment mutations emit a command event AND a transaction event", () => {
    const { commands, state } = setup();
    const region = state.documentIndex.regions[0];
    if (!region) throw new Error("Expected region");

    const commandBefore = commandEvents(events).length;
    const txBefore = transactionEvents(events).length;

    const result = commands.createCommentThread(
      state,
      { regionId: region.id, startOffset: 0, endOffset: 5 },
      "test comment",
    );

    expect(result).not.toBeNull();
    expect(commandEvents(events).length).toBe(commandBefore + 1);
    // `spliceEditorCommentThreads` emits a synthetic `spliceCommentThreads`
    // transaction so the diagnostics surface counts comment writes alongside
    // text edits — and so upstream's @mentions paths (which flow through
    // `replyToCommentThread` / `editComment`) are observable.
    const txAfter = transactionEvents(events);
    expect(txAfter.length).toBe(txBefore + 1);
    const last = txAfter[txAfter.length - 1];
    if (last?.type !== "transaction") throw new Error("unreachable");
    expect(last.name).toBe("spliceCommentThreads");
  });

  test("set-selection actions do not emit transaction events", () => {
    const { state } = setup();
    const region = state.documentIndex.regions[0];
    if (!region) throw new Error("Expected region");

    const txBefore = transactionEvents(events).length;
    setSelection(state, { regionId: region.id, offset: 0 });
    expect(transactionEvents(events).length).toBe(txBefore);
  });

  test("no-op comment mutations do not emit command events", () => {
    const { commands, state } = setup();
    const commandBefore = commandEvents(events).length;

    // Targeting a non-existent thread index produces null and emits no event.
    const result = commands.replyToCommentThread(state, 999, "reply");
    expect(result).toBeNull();
    expect(commandEvents(events).length).toBe(commandBefore);
  });
});
