# Documint

A canvas-based markdown editor for React. Documint renders your markdown as a fully styled, readable document — but when you click into a block, it becomes editable in place. The rest of the document stays rendered. Think of it as a writing surface that looks like a preview and feels like an editor.

## Getting started

Requires [Bun](https://bun.sh) v1.3.11+.

```sh
bun install          # install dependencies
bun dev              # start the playground dev server (hot reload)
bun run build        # production build
```

The playground (`./playground/`) is a dogfooding app for the public component API. Use it to test real browser behavior — input, scrolling, resize, and paint.

## Usage

```tsx
import { Documint } from "documint";
import { useState } from "react";

function Editor() {
  const [content, setContent] = useState("# Hello\n\nStart writing...");

  return (
    <Documint
      content={content}
      onContentChange={(markdown) => setContent(markdown)}
    />
  );
}
```

### Props

| Prop | Type | Description |
| --- | --- | --- |
| `content` | `string` | Markdown string (controlled) |
| `onContentChange` | `(content: string, document: Document) => void` | Called when the document is edited |
| `onStateChange` | `(state: DocumintState) => void` | Called with editor metrics (selection, line count, etc.) |
| `theme` | `EditorTheme` | Color theme — built-in options: `lightEditorTheme`, `darkEditorTheme`, `midnightEditorTheme`, `mintEditorTheme` |
| `className` | `string` | CSS class for the host container |

## Why canvas?

Traditional rich-text editors fight the DOM — contentEditable quirks, cross-browser selection bugs, and layout thrashing at scale. Documint sidesteps all of that by painting to a `<canvas>`, giving full control over text layout, pixel-perfect rendering, and the ability to only repaint what actually changed.

The goal is to achieve the highest level of performance possible with absolutely no compromise on how the editor feels. Every animation, transition, and interaction should feel delightful and immediate. Editing should be intuitive, the kind of experience where you forget you're using a tool and just write.

Markdown is the persistence format. What you save is always clean, portable markdown, the editor just makes it pleasant to write.

## How it works

### The pipeline

```
markdown → Document → DocumentEditor → DocumentLayout → canvas pixels
```

1. **Markdown** is parsed into a **Document** — a format-agnostic semantic model of blocks (paragraphs, headings, lists, tables, code blocks) and inline spans (bold, italic, links, etc.).
2. The **DocumentEditor** projects the document into editable state. Editing commands, undo/redo, and navigation operate here, then produce the next semantic document.
3. The **DocumentLayout** turns editor state + viewport dimensions into measured geometry — line positions, character boundaries, and hit-test targets.
4. **Paint** draws the visible portion of that layout onto canvas.

### Rendering loop

The editor uses a `requestAnimationFrame`-based render loop with several layers of optimization:

**Dual canvas layers.** There are two canvases stacked together — one for document content and one for the cursor. A caret blink only repaints the tiny cursor canvas; the document layer is untouched.

**Viewport culling.** The full document's block positions are cached in a viewport plan. When paint runs, a binary search finds which regions intersect the visible viewport (plus an overscan buffer). Only those regions are laid out and painted — everything off-screen is skipped.

**Measurement caching.** Six LRU caches store previously computed work across renders — glyph widths, text segmentation, line wrapping, character boundaries, block heights, and viewport plans. Cache keys are derived from content, so edits naturally invalidate stale entries without explicit dirty-tracking.

**Coalesced scheduling.** Multiple invalidations within the same frame (e.g., a keystroke that changes text and triggers an animation) are collapsed into a single repaint.

**Frame-locked animations.** Block flash and text highlight animations automatically schedule the next frame while running, and stop requesting frames when idle.

### Text measurement

Layout intelligence is powered by [Pretext](https://github.com/chenglou/pretext), which handles Unicode segmentation, glyph measurement, and line-breaking. Pretext is a measurement-only dependency — it never owns the caret, IME, clipboard, undo, or selection. The canvas owns all interactive state.

## Architecture

### Subsystems

| Layer | Path | Role |
| --- | --- | --- |
| **Document** | `src/document` | Format-agnostic semantic model — block and inline node types. Knows nothing about markdown syntax or React. |
| **Markdown** | `src/markdown` | Parses markdown into `Document` and serializes `Document` back to canonical markdown. |
| **Editor** | `src/editor` | Framework-agnostic editing engine — editor state, editing operations, navigation, layout, hit-testing, and canvas paint. |
| **Component** | `src/component` | React host — bridges controlled `content` ↔ `Document`, wires browser events into the editor, and exposes the `Documint` component. |
| **Comments** | `src/comments` | Anchored annotations — comment persistence, anchor matching/repair, and review state. Comments are metadata, not document content. |

### Design principles

- **Markdown is the persistence boundary.** The document model is format-agnostic, but markdown is the only serialization adapter today.
- **Only the active region is editable.** The rest of the document stays rendered — no mode switching, no split panes.
- **The editor is framework-agnostic.** All editing, layout, and paint logic lives in `src/editor` with no React dependency. The React component in `src/component` is a thin host.
- **Canvas is the live surface.** No contentEditable, no hidden textareas for layout. The canvas owns rendering and the editor owns input handling.

## Markdown support

| Feature | Status |
| --- | --- |
| Paragraphs | ✅ |
| Headings (h1–h6) | ✅ |
| Bold / italic / strikethrough / underline | ✅ |
| Inline code | ✅ |
| Links | ✅ |
| Images | ✅ |
| Blockquotes | ✅ |
| Ordered & unordered lists | ✅ |
| Task lists (checkboxes) | ✅ |
| Nested lists | ✅ |
| Code blocks (with language tag) | ✅ |
| Tables (with alignment) | ✅ |
| Thematic breaks (horizontal rules) | ✅ |
| Line breaks | ✅ |
| Anchored comments | ✅ |
| Code block syntax highlighting | 🚧 Pending |
| Footnotes | 🚧 Pending |
| Math / LaTeX | 🚧 Pending |
| Embedded HTML | Preserved as raw blocks (not rendered) |
| Directives (remark-directive) | Preserved as raw blocks (not rendered) |

## Scripts

| Command | Description |
| --- | --- |
| `bun dev` | Start the playground dev server |
| `bun run build` | Production build |
| `bun test` | Run all tests |
| `bun run test:goldens` | Run markdown golden tests |
| `bun run lint` | Lint with oxlint |
| `bun run format` | Format with oxfmt |
| `bun run typecheck` | Type-check with tsc |
| `bun run benchmark` | Run benchmarks |
