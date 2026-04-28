// Module-scoped render-tier ambient. The upstream render scheduler exposes
// four discrete schedule methods (scheduleFullRender / scheduleFullPaint /
// scheduleContentPaint / scheduleOverlayPaint) that all funnel into the
// same renderContent/renderOverlay callbacks without passing any context
// through. Diagnostic instrumentation needs to know which of those four
// paths invoked a paint so it can stamp the `paint` event with the right
// tier. Producers (Documint.tsx) wrap each scheduler entry-point with
// `withRenderTier` (or set/clear directly) so paint instrumentation can
// read the tier inside `paintContent` / `paintOverlay` callbacks via
// `readRenderTier`.

export type RenderTier = "viewport" | "full-paint" | "content" | "overlay";

let currentRenderTier: RenderTier | null = null;

export function setRenderTier(tier: RenderTier | null): void {
  currentRenderTier = tier;
}

export function readRenderTier(): RenderTier | null {
  return currentRenderTier;
}

export function withRenderTier<T>(tier: RenderTier, fn: () => T): T {
  const previous = currentRenderTier;
  currentRenderTier = tier;
  try {
    return fn();
  } finally {
    currentRenderTier = previous;
  }
}
