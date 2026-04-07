# Editor

This sub-system owns the framework-agnostic editing engine. Its internal pipeline is:

`Document -> EditorModel -> ViewportLayout -> canvas 2D drawing calls`

The important boundary is that `src/editor` owns the capabilities in that pipeline, while `src/component` owns orchestration of when they run. In other words:

- `src/editor` does not own React lifecycle, DOM measurement, or canvas mounting.
- `src/component` does not own editing semantics, geometry algorithms, or paint logic.

The host-facing `Editor` API is the single typed interface that `src/component` calls. It wraps state transitions, comment operations, layout preparation, hit testing, and paint entrypoints without exposing internal model/layout details. Markdown persistence and React lifecycle stay out of this layer entirely.

### Key Areas

- **API** (`api.ts`, `index.ts`) - Owns the host-facing `Editor` facade. Methods are grouped by concern: state lifecycle, queries, comments, text editing, formatting, structure, tables, links, selection/navigation, layout/hit-testing, and rendering. This layer is an integration surface, not the primary home of editing or paint logic.

- **Model** (`model/`) - Owns the `Document` -> `EditorModel` projection, editor state with undo/redo, and all semantic editing operations: text replacement, inline formatting, block-level edits, list operations, table mutations, input rules, and structural rewrites.

- **Navigation** (`navigation/`) - Owns caret and range movement. Vertical movement dispatches through a table-first, flow-fallback chain — the table handler returns null when the caret isn't in a table, and the flow handler takes over. Horizontal movement crosses region boundaries naturally.

- **Layout** ([`layout/`](layout/AGENTS.md)) - Owns the `EditorModel` -> `ViewportLayout` projection and all editor geometry: viewport planning, line layout, hit testing, caret measurement, and measurement caching.

- **Canvas** (`canvas/`) - Owns canvas-specific code: immediate-mode painting from prepared layout plus editor/runtime inputs (selection, comments, presence, animations, theme), and shared canvas-measurement primitives (font metrics, prepared-text cache) that both paint and layout consume. Does not build a retained scene graph after `ViewportLayout`; translates layout/runtime data directly into canvas 2D drawing calls.

- **Annotations** (`annotations/`) - Owns editor-side projection of durable annotation semantics into live runtime data: comment range projection, presence cursor resolution, and optimistic same-region comment remapping during direct edits.

- **Preview** (`preview-state.ts`) - Owns derived active-block and active-span context for the editor surface.
