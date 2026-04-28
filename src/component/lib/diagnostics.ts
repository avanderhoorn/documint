import { useEffect, type RefObject } from "react";

import { DIAGNOSTIC_EVENT, type Diagnostic } from "@/lifecycle";

/**
 * Lightweight runtime instrumentation for the editor.
 *
 * Diagnostic events are emitted by internal hooks (`useInput`,
 * `syncInputContext`, etc.) and rendered as a live log by the
 * playground's `DiagnosticsPopover` (which subscribes to {@link
 * DIAGNOSTIC_EVENT} on `window`).
 *
 * The wire constant and {@link Diagnostic} envelope are owned by
 * `src/lifecycle.ts` so the typed lifecycle stream and this raw bridge
 * stream agree on a single bus contract.
 *
 * Diagnostics are an internal dev tool, not part of the library's public
 * API — neither this module nor lifecycle.ts is re-exported from
 * `src/index.ts`.
 *
 * # Build-time gating
 *
 * Every call site is gated by an inline
 * `process.env.NODE_ENV !== "production"` check that the bundler folds at
 * build time, dead-code-eliminating the entire branch. Inline the literal
 * (rather than aliasing) so Bun's minifier reliably substitutes it inside
 * exported function bodies.
 */

// Re-export the wire constants so callers in the component layer can
// continue to import them from this module.
export { DIAGNOSTIC_EVENT, type Diagnostic };

/**
 * Emit a diagnostic event for any subscribed tool to render. Always wrap
 * call sites in `if (process.env.NODE_ENV !== "production")` so the
 * bundler can strip the call and its argument expressions in production.
 *
 * In environments without `window` (e.g. SSR, tests), falls back to
 * `console.log` so the diagnostic isn't silently dropped.
 */
export function emitDiagnostic(kind: string, detail: Record<string, unknown>) {
  if (typeof window === "undefined") {
    // eslint-disable-next-line no-console
    console.log(`[diag ${kind}]`, detail);
    return;
  }
  window.dispatchEvent(
    new CustomEvent<Diagnostic>(DIAGNOSTIC_EVENT, {
      detail: { kind, detail, ts: Date.now() },
    }),
  );
}

/**
 * Install diagnostic listeners that don't fit the inline-emit pattern at
 * call sites — namely, listeners on the input bridge and the document
 * itself, which exist independently of any single editor handler:
 *
 *   - **Composition events** (`compositionstart` / `compositionupdate` /
 *     `compositionend`) on the input textarea. Useful for observing IME
 *     and dictation behavior independent of `beforeinput` / `input`.
 *   - **Document `selectionchange`**. Fires regardless of whether React
 *     state propagation closes the loop, which is useful for diagnosing
 *     cases where the editor caret appears to move but no React
 *     re-render follows.
 *
 * Wrap the call to this hook in
 * `if (process.env.NODE_ENV !== "production")` like every other
 * diagnostic — in production the entire wrapping block (this hook call
 * and the two `useEffect` registrations it would make) is stripped.
 */
export function useDiagnostics(inputRef: RefObject<HTMLTextAreaElement | null>) {
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const log = (kind: string) => (event: Event) => {
      const ce = event as CompositionEvent;
      emitDiagnostic(kind, {
        data: ce.data,
        taValue: input.value,
        selectionStart: input.selectionStart,
        selectionEnd: input.selectionEnd,
      });
    };
    const onStart = log("compositionstart");
    const onUpdate = log("compositionupdate");
    const onEnd = log("compositionend");
    input.addEventListener("compositionstart", onStart);
    input.addEventListener("compositionupdate", onUpdate);
    input.addEventListener("compositionend", onEnd);
    return () => {
      input.removeEventListener("compositionstart", onStart);
      input.removeEventListener("compositionupdate", onUpdate);
      input.removeEventListener("compositionend", onEnd);
    };
  }, [inputRef]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onSelectionChange = () => {
      const input = inputRef.current;
      emitDiagnostic("selectionchange", {
        activeElementIsInput: document.activeElement === input,
        taSelectionStart: input?.selectionStart ?? null,
        taSelectionEnd: input?.selectionEnd ?? null,
      });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [inputRef]);
}
