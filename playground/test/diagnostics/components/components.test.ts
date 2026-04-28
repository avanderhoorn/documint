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
// React needs IS_REACT_ACT_ENVIRONMENT to suppress act() warnings in tests
// @ts-expect-error — React test flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { type Root, createRoot } from "react-dom/client";
import { act } from "react";
import {
  DiagnosticsBlock,
  DiagnosticsPrimary,
  DiagnosticsSecondaryLine,
  DiagnosticsSecondaryStack,
} from "../../../src/diagnostics/components";

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

function render(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  activeRoot = root;
  activeContainer = container;
  return container;
}

describe("DiagnosticsPrimary", () => {
  test("renders count only when p50/p99 are omitted", () => {
    const el = render(createElement(DiagnosticsPrimary, { count: 42 }));
    expect(el.textContent).toContain("42");
    expect(el.textContent).not.toContain("ms");
  });

  test("renders count + p50/p99 when provided", () => {
    const el = render(createElement(DiagnosticsPrimary, { count: 10, p50: 0.3, p99: 1.1 }));
    expect(el.textContent).toContain("10");
    expect(el.textContent).toContain("0.3ms");
    expect(el.textContent).toContain("1.1ms");
  });

  test("shows placeholder timing when count is 0 but p50/p99 are provided", () => {
    const el = render(createElement(DiagnosticsPrimary, { count: 0, p50: 0, p99: 0 }));
    expect(el.textContent).toContain("0");
    expect(el.textContent).toContain("–");
  });
});

describe("DiagnosticsSecondaryLine", () => {
  test("renders abbreviations with correct separator", () => {
    const el = render(
      createElement(DiagnosticsSecondaryLine, {
        items: [
          { abbr: "RB", value: 5, label: "Replace Block" },
          { abbr: "RR", value: 0, label: "Replace Root" },
          { abbr: "RRR", value: 1, label: "Replace Root Range" },
        ],
      }),
    );
    const text = el.textContent!;
    expect(text).toContain("RB");
    expect(text).toContain("5");
    expect(text).toContain("–");
    expect(text).toContain("RR");
    expect(text).toContain("RRR");
  });

  test("items have title attributes matching label for tooltip", () => {
    const el = render(
      createElement(DiagnosticsSecondaryLine, {
        items: [
          { abbr: "RB", value: 5, label: "Replace Block" },
          { abbr: "RR", value: 0, label: "Replace Root" },
        ],
      }),
    );
    const spans = el.getElementsByTagName("span");
    const titledSpans = Array.from(spans).filter((s) => s.hasAttribute("title"));
    expect(titledSpans.length).toBe(2);
    expect(titledSpans[0]?.getAttribute("title")).toBe("Replace Block");
    expect(titledSpans[1]?.getAttribute("title")).toBe("Replace Root");
  });
});

describe("DiagnosticsSecondaryStack", () => {
  test("renders items in newest-first order (as provided)", () => {
    const el = render(
      createElement(DiagnosticsSecondaryStack, {
        items: [
          { label: "insertText", count: 3 },
          { label: "moveCaretHorizontally", count: 1 },
        ],
      }),
    );
    const text = el.textContent!;
    const insertIdx = text.indexOf("insertText");
    const moveIdx = text.indexOf("moveCaretHorizontally");
    expect(insertIdx).toBeLessThan(moveIdx);
  });

  test("limits visible items to maxVisibleRows via overflow hidden", () => {
    const el = render(
      createElement(DiagnosticsSecondaryStack, {
        items: [
          { label: "a", count: 1 },
          { label: "b", count: 2 },
          { label: "c", count: 3 },
          { label: "d", count: 4 },
          { label: "e", count: 5 },
        ],
        maxVisibleRows: 2,
      }),
    );
    const divs = el.getElementsByTagName("div");
    const container = divs[0] as HTMLElement;
    expect(container?.style.overflow).toBe("hidden");
    expect(container?.style.height).toBe("32px");
  });
});

describe("DiagnosticsBlock", () => {
  test("renders dashed border style when dashed prop is true", () => {
    const el = render(
      createElement(DiagnosticsBlock, { label: "Transaction", dashed: true }, "content"),
    );
    const blocks = el.getElementsByTagName("div");
    const block = blocks[0] as HTMLElement;
    expect(block).toBeDefined();
    expect(block.style.borderStyle).toBe("dashed");
    expect(el.textContent).toContain("Transaction");
  });

  test("hides content when hidden is true", () => {
    const el = render(
      createElement(DiagnosticsBlock, { label: "Overlay", hidden: true }, "should not appear"),
    );
    expect(el.textContent).not.toContain("Overlay");
    expect(el.textContent).not.toContain("should not appear");
  });

  test("renders with active background when status is active", () => {
    const el = render(
      createElement(DiagnosticsBlock, { label: "Paint", status: "active" }, "content"),
    );
    const blocks = el.getElementsByTagName("div");
    const block = blocks[0] as HTMLElement;
    expect(block.style.background).not.toBe("transparent");
  });

  test("renders with transparent background when status is idle", () => {
    const el = render(
      createElement(DiagnosticsBlock, { label: "Parse", status: "idle" }, "content"),
    );
    const blocks = el.getElementsByTagName("div");
    const block = blocks[0] as HTMLElement;
    expect(block.style.background).toBe("transparent");
  });

  test("renders with position relative for child positioning", () => {
    const el = render(
      createElement(DiagnosticsBlock, { label: "Input" }, "content"),
    );
    const blocks = el.getElementsByTagName("div");
    const block = blocks[0] as HTMLElement;
    expect(block.style.position).toBe("relative");
  });
});
