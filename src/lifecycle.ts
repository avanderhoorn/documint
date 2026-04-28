// Typed semantic lifecycle events for Documint. Lives at the package root
// because the event union spans every subsystem: parse/serialize at the
// markdown boundary, paint/overlay/viewport in the component layer,
// command/transaction in the editor, and intent in the input bridge.
//
// Lifecycle events ride the same window CustomEvent bus as the raw
// diagnostics surface in `src/component/lib/diagnostics.ts`, namespaced via
// envelope `kind: "lifecycle:<type>"`. A single subscriber sees both
// surfaces — upstream's raw forensic events AND our typed semantic events.
// The wire constants and envelope shape (`DIAGNOSTIC_EVENT`, `Diagnostic`)
// are owned here so the bridge module can import them rather than re-declare
// them — single source of truth for the bus contract.
//
// Every emission helper is gated by an inline
// `process.env.NODE_ENV !== "production"` check that the bundler folds at
// build time, so production strips the entire emission body — no event
// allocation, no `performance.now`, no dispatch.

/* Wire format (shared with src/component/lib/diagnostics.ts) */

/** CustomEvent type used for both lifecycle and raw diagnostic events. */
export const DIAGNOSTIC_EVENT = "documint:diagnostic";

/** Wire-format payload of a diagnostic event. */
export type Diagnostic = {
  kind: string;
  detail: Record<string, unknown>;
  ts: number;
};

/* Public event vocabulary */

export type LifecycleEvent =
  | { type: "command"; name: string; durationMs: number }
  | {
      type: "transaction";
      name: string;
      durationMs: number;
      // Structural movement caused by this transaction. Cheap O(1) deltas
      // computed from `documentIndex.{blocks,regions}.length` before/after.
      blockCountDelta: number;
      regionCountDelta: number;
    }
  | { type: "parse"; durationMs: number }
  | { type: "serialize"; deltaChars: number; durationMs: number }
  | { type: "viewport"; laidOut: number; total: number; durationMs: number }
  | {
      type: "paint";
      tier: "content" | "viewport";
      durationMs: number;
      // Number of region tiles drawn in this paint.
      tilesPainted: number;
    }
  | { type: "overlay"; durationMs: number }
  // Reads as "the editor was instructed to do X" — semantic, post-decision.
  // Disambiguated from the raw browser-bridge `input` events that
  // `src/component/lib/diagnostics.ts` emits.
  | { type: "intent"; name: string };

// Variants that carry timing — used to type `measureLifecycle`'s argument
// so the `intent` variant (no `durationMs`) can't be passed to it.
type TimedLifecycleEvent = Extract<LifecycleEvent, { durationMs: number }>;

// Per-variant fields that aren't known until after `fn` runs (e.g.
// `deltaChars`, `laidOut`, `tilesPainted`). `durationMs` is excluded because
// `measureLifecycle` always supplies it.
type EnrichmentFor<K extends TimedLifecycleEvent["type"]> = Partial<
  Omit<Extract<TimedLifecycleEvent, { type: K }>, "type" | "durationMs">
>;

/* Emitter */

/**
 * Dispatch a fully-formed `LifecycleEvent` onto the window diagnostic bus
 * under `kind: "lifecycle:<type>"`. Body is NODE_ENV-gated so production
 * builds collapse to a noop. Wrap the call externally with the same gate
 * at sites whose payload computation is non-trivial — the argument
 * expression itself is not stripped automatically.
 */
export function emitLifecycle(event: LifecycleEvent): void {
  if (process.env.NODE_ENV === "production") return;
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<Diagnostic>(DIAGNOSTIC_EVENT, {
      detail: {
        kind: `lifecycle:${event.type}`,
        detail: event as unknown as Record<string, unknown>,
        ts: Date.now(),
      },
    }),
  );
}

/**
 * Time `fn`, then emit a `TimedLifecycleEvent` with `durationMs`. If
 * `enrich` is supplied its return value is shallow-merged after timing —
 * its keys are constrained to the variant identified by `event.type`, so a
 * `paint` enrich cannot return `serialize` fields. If `fn` throws, the
 * exception propagates and no event is emitted. NODE_ENV-gated; in
 * production collapses to `return fn()`.
 */
export function measureLifecycle<K extends TimedLifecycleEvent["type"], T>(
  fn: () => T,
  event: { type: K } & EnrichmentFor<K>,
  enrich?: (result: T) => EnrichmentFor<K>,
): T {
  if (process.env.NODE_ENV === "production") return fn();
  const start = performance.now();
  const result = fn();
  const durationMs = performance.now() - start;
  emitLifecycle({ ...event, ...(enrich ? enrich(result) : null), durationMs } as LifecycleEvent);
  return result;
}

/* Subscription */

/**
 * Subscribe to lifecycle events. Filters the shared bus down to
 * `kind: "lifecycle:*"` envelopes and hands the inner `LifecycleEvent` to
 * `handler`. Returns an unsubscribe function. NODE_ENV-gated: in
 * production no listener is registered and the unsubscribe is a noop.
 *
 * Used by the playground's debug panel and by tests; exists so consumers
 * don't reimplement the prefix-filter + envelope-strip dance.
 */
export function subscribeLifecycle(handler: (event: LifecycleEvent) => void): () => void {
  if (process.env.NODE_ENV === "production") return () => {};
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const ce = event as CustomEvent<Diagnostic>;
    const kind = ce.detail?.kind;
    if (typeof kind !== "string" || !kind.startsWith("lifecycle:")) return;
    handler(ce.detail.detail as unknown as LifecycleEvent);
  };
  window.addEventListener(DIAGNOSTIC_EVENT, listener);
  return () => window.removeEventListener(DIAGNOSTIC_EVENT, listener);
}
