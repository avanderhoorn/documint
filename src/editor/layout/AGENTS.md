# Layout

This sub-system owns editor geometry. It turns `EditorModel` into exact line, region, and block positions for the visible viewport slice, while using cheap whole-document estimation for scrolling and viewport planning. The core invariant is that visible content always uses exact layout — estimation exists to avoid full-document layout cost, not to weaken on-screen correctness. When changing spacing, typography, or block geometry, both the exact path (`document.ts`) and the estimation path (`viewport.ts`) must stay in sync. Measurement results are cached at multiple layers with cache keys that include text hashes, image resource signatures, and layout options — so any change to measurement inputs must also update the relevant cache key.

### Key Files

- `index.ts` - Owns the public layout API. Renames internal types for a cleaner surface (e.g. `DocumentCaretTarget` → `CaretTarget`).

- `document.ts` - Owns exact local layout for a concrete region set: line positions, region extents, block extents, caret targets, and the shared spacing policy.

- `viewport.ts` - Owns viewport-aware layout orchestration: cheap whole-document height estimation, visible slice selection with overscan, exact layout for that slice, and coordinate shifting between viewport and document space.

- `text.ts` - Owns text typography and measurement: heading font scale, block-specific font rules, line wrapping, and canvas-based text measurement.

- `image.ts` - Owns inline image sizing policy: fallback dimensions during loading, aspect-ratio-preserving scaling, and image signatures for cache invalidation.

- `table.ts` - Owns exact table geometry: uniform column widths, row height harmonization across cells, and cell-level measurement delegation.

- `hit-test.ts` - Owns pointer and caret targeting against prepared layout geometry, including link and task checkbox hit detection and comment range integration for hover targets.
