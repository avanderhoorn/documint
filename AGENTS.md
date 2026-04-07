# AGENTS.md

## Mission

Build a markdown-native writing surface that stays rendered, but becomes locally editable at the active block or span. Use `Document` as the semantic truth, `DocumentEditor` as the hot-path editing projection, and Pretext for text measurement and layout intelligence.

## Product principles

- Markdown is the persistence boundary.
- The editing projection is semantic, not raw markdown text.
- Only the active region reveals source-like editing affordances.
- Comments are anchored annotations, not document content.
- Pretext never owns caret, IME, clipboard, undo, or live selection.
- Canvas is the live editor surface.
- The editor must fit and react to the dimensions of its host element.

## Toolchain defaults

- Use Bun as the default package manager, script runner, bundler, and test runner.
- Use `oxlint` and `oxfmt`.
- Keep the playground healthy; it is a required dogfooding surface.

## Writing great code

- Start with the correct layer. Keep logic in the lowest correct subsystem and own it there completely instead of smearing one behavior across component, editor, markdown, and document layers.
- Prefer small, semantic public APIs. Export capabilities in terms of what they mean, not how they are implemented.
- Make files read clearly from top to bottom. Put the main entrypoint first, then the supporting helpers in dependency order.
- Use concise module comments when they help a reader understand the file’s role. Skip boilerplate commentary.
- Choose semantic names for functions, types, and variables. Avoid names that overfit the current implementation detail.
- Keep helper modules only when they earn their keep through clearer ownership, reuse, or simpler reading.
- Prefer declarative tables and small policy objects when they make behavior easier to scan.

## Writing great tests

- Test the subsystem that owns the behavior.
- Prefer focused unit coverage over broad UI smoke tests.
- Use markdown golden tests to protect round-trip stability.
- Add or update benchmark coverage when changing layout, paint, viewport planning, or other hot paths.
- Verify the real browser behavior in the playground after meaningful UI changes, especially for input, scrolling, resize, and paint issues.

## Architecture

The core data pipeline is `markdown → Document → EditorModel → ViewportLayout → canvas pixels`.

At the repo root, think in terms of altitude and orchestration:

- `src/document` owns semantic document truth.
- `src/editor` owns the framework-agnostic editing engine capabilities that operate on that truth: projection, mutation, geometry, hit testing, and immediate-mode paint.
- `src/component` owns browser and React orchestration: when editor state changes, when layout is prepared, and when content/overlay canvases repaint.

Each subsystem has its own `AGENTS.md` with the lower-level boundaries and ownership.

- [`src/document`](src/document/AGENTS.md) - Closed, immutable semantic document model.
- [`src/markdown`](src/markdown/AGENTS.md) - Markdown parsing and serialization boundary, implemented as a bespoke direct `markdown → Document → markdown` pipeline.
- [`src/editor`](src/editor/AGENTS.md) - Framework-agnostic editing engine: `Document` → `EditorModel` → `ViewportLayout` → canvas.
- [`src/comments`](src/comments/AGENTS.md) - Anchored comment persistence, repair, and thread mutations.
- [`src/component`](src/component/AGENTS.md) - React host: content bridging, browser lifecycle, and leaf UI.
- `playground` - Dogfooding app for exercising real browser behavior.
- `scripts` - Build, packaging, and benchmark automation.
- `test` - Unit tests, golden fixtures, and benchmark support.

## Definition of done

1. The change works in the playground.
2. Relevant unit and golden tests pass.
3. Markdown import/export stability is preserved.
4. Undo/redo, selection, and comments are not corrupted.
5. Benchmarks do not regress materially for hot paths.
