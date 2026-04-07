# Cross-block selection and markdown clipboard

## Summary

Add first-class cross-region selection and markdown-aware clipboard to the editor. Together these deliver: `cmd+a` select-all, delete / type-to-replace across blocks, copy/cut producing raw markdown (preserving marks, links, images, block structure), and paste of markdown that parses into real document structure.

"Select all" is not a feature we build — it is the one-line consequence of the other two.

## Guiding principles

- **Select-all is not special.** Any behavior exposed via `cmd+a` should be the natural consequence of an ordinary selection that happens to span the whole document.
- **Cross-region selection already exists in the model.** `EditorSelection` is region-agnostic today. The work is making the *callers* that currently suppress it stop suppressing it.
- **Markdown is the persistence boundary** (per `AGENTS.md`). The clipboard should speak markdown the same way the file format does.
- **Two mutation primitives, shared internals.** Text replace (`replaceText`) and block insert (`replaceBlocks`) live side-by-side in `replace.ts` and share the same prefix/suffix trim helpers for cross-region work. Single-region text replace keeps its existing optimized path; `replaceBlocks` is a new sibling for structural paste. Each has its own command, transaction kind, and public API entry — no overloading.
- **Own the behavior in the lowest correct layer.** Selection motion lives in `src/editor/navigation`; mutation in `src/editor/model/mutations`; markdown in `src/markdown`; clipboard plumbing in `src/component/hooks/useInput.ts`. No smearing.
- **No new concepts the codebase doesn't need.** No new file if an existing one owns the concern. No new type if `Block[]` suffices.

## Current state of the code (the bits that matter)

**Selection model** (`src/editor/model/selection.ts`) — already region-agnostic. `normalizeSelection` and `resolveSelectionOrder` put any two points in canonical doc order via `regionOrderIndex`.

**Painting** (`src/editor/render/paint.ts:130-134, 634-664`) — `selectedContainerId` is computed *only* when anchor and focus share a region; otherwise null and the highlight paints nothing.

**Mutation** (`src/editor/model/mutations/text/replace.ts:28-29`) — hard throw on cross-region input:

```ts
if (normalized.start.regionId !== normalized.end.regionId) {
  throw new Error("Cross-region text replacement is not supported yet.");
}
```

**Motion primitives** (`src/editor/navigation/line.ts`):

| Primitive | Cross-region? | Accepts `extendSelection`? | Notes |
| --- | --- | --- | --- |
| `moveCaretHorizontallyInFlow` | ✅ | ✅ | Already correct. |
| `moveCaretVerticallyInFlow` | ✅ visually | ❌ — hardcodes `setSelection(..., {regionId, offset})` at line 93-96. | Signature doesn't take the flag. |
| `moveCaretByViewportInFlow` (page up/down) | ✅ visually | ❌ — same pattern at line 167-170. | Same fix. |
| `moveCaretToCurrentLineBoundary` (Home/End, Cmd+←/→) | n/a | ✅ | Line-scoped by design — a visual line lives in one region. Unchanged. |

**Mouse drag** (`src/editor/layout/hit-test.ts:147-150`) — `resolveDragFocusPoint` detects cross-region hits and *explicitly clamps* the focus back to the anchor region's `0` or `.text.length`. Active suppression.

**Clipboard** (`src/component/hooks/useInput.ts:361-400`) — only `text/plain`, routed through `readSingleContainerSelectionText` which returns `""` for multi-region selections.

**Keybindings** (`src/component/lib/keybindings.ts`) — no `cmd+a`, no doc-boundary motion. `ArrowUp/Down` in `useInput.ts:634` don't forward `event.shiftKey`.

**Markdown** (`src/markdown/parser/index.ts`, `src/markdown/serializer.ts`) — full bidirectional parser/serializer. `parseMarkdown(source) → Document`, `serializeMarkdown(document) → string`. Not wired to clipboard.

**Existing transaction primitives** (`src/editor/model/types.ts`) — `replace-root-range` already exists and replaces `count` root blocks at `rootIndex` with `Block[]`. This is the shape multi-region `replaceText` emits.

## Architecture

Two layers. Layer 1 makes cross-region selection a first-class citizen end-to-end. Layer 2 wires markdown into the clipboard on top of it. Each layer's steps are independently shippable.

### Layer 1 — Cross-region selection

Nothing about the selection *model* changes. This is about removing suppression and plumbing an existing `extendSelection` flag through paths that drop it, then extending the one mutation that enforces single-region.

#### 1a. Painting across regions — `paint.ts`

Replace the single-region `selectedContainerId` gate (lines 130-134) with a per-line overlap test against the normalized selection's region-order range.

In `paintCanvasSelectionHighlight` (634-664), replace the early return with:

```ts
const lineOrder = regionOrderIndex.get(line.regionId);
if (lineOrder === undefined || lineOrder < startOrder || lineOrder > endOrder) return;

const overlapStart = lineOrder === startOrder
  ? Math.max(line.start, normalizedSelection.start.offset)
  : line.start;
const overlapEnd = lineOrder === endOrder
  ? Math.min(line.end, normalizedSelection.end.offset)
  : line.end;
```

The existing fill logic is unchanged. Middle regions highlight whole lines end-to-end. `startOrder`/`endOrder` are hoisted once per paint pass.

#### 1b. Drag across regions — `hit-test.ts`

Delete the clamp at 147-150. Let `resolveDragFocusPoint` return the actual hit regardless of region:

```ts
if (!hit) { /* unchanged — vertical overshoot fallback */ }
return { regionId: hit.regionId, offset: hit.offset };
```

Pure deletion. `isSelectionPointBeforeAnchor` stays (unused here after this change — can be left for other callers).

#### 1c. Vertical motion honors shift — `line.ts`, `useInput.ts`

Add `extendSelection: boolean` to `moveCaretVerticallyInFlow` and `moveCaretByViewportInFlow`. Replace their final `setSelection(state, { regionId, offset })` with the already-defined `setSelectionPoint(state, regionId, offset, extendSelection)` helper at line 181.

Forward `event.shiftKey` from the ArrowUp/Down branch in `useInput.ts:633-635`:

```ts
return editor.moveCaretVertically(state, viewport.layout,
  event.key === "ArrowUp" ? -1 : 1, event.shiftKey);
```

Update the `editor.moveCaretVertically` / `editor.moveCaretByViewport` wrappers in `api.ts` to forward the flag.

#### 1d. Document-boundary motion — `line.ts`, `api.ts`, `keybindings.ts`

Two new primitives in `navigation/line.ts`, next to the existing line-boundary peer (`moveCaretToCurrentLineBoundary`):

```ts
export function moveCaretToDocumentStart(state: EditorState, extendSelection: boolean) {
  const first = state.documentIndex.regions[0];
  if (!first) return state;
  return setSelectionPoint(state, first.id, 0, extendSelection);
}

export function moveCaretToDocumentEnd(state: EditorState, extendSelection: boolean) {
  const last = state.documentIndex.regions.at(-1);
  if (!last) return state;
  return setSelectionPoint(state, last.id, last.text.length, extendSelection);
}
```

Bindings (Mac conventions):

```ts
{ key: "ArrowUp",   modKey: true, shiftKey: "any", command: "moveToDocumentStart" },
{ key: "ArrowDown", modKey: true, shiftKey: "any", command: "moveToDocumentEnd" },
```

Register the two commands in `EditorCommand` and dispatch them in `applyKeyboardEvent`.

#### 1e. Select-all — `api.ts`, `keybindings.ts`

```ts
export function selectAll(state: EditorState): EditorState {
  const first = state.documentIndex.regions[0];
  const last  = state.documentIndex.regions.at(-1);
  if (!first || !last) return state;
  return setSelection(state, {
    anchor: { regionId: first.id, offset: 0 },
    focus:  { regionId: last.id,  offset: last.text.length },
  });
}
```

```ts
{ key: "a", modKey: true, command: "selectAll" },
```

#### 1f. Extend `replaceText` for cross-region — `replace.ts`

**This is the only new logic in Layer 1.** Keep the signature unchanged (`text: string`). Remove the throw at line 28-29 and route the multi-region case to a new internal `replaceTextMultiRegion` in the same file:

```ts
export function replaceText(
  documentIndex: DocumentIndex,
  selection: EditorSelection,
  text: string,
): { documentIndex: DocumentIndex; selection: EditorSelection } {
  const normalized = normalizeSelection(documentIndex, selection);
  if (normalized.start.regionId === normalized.end.regionId) {
    return replaceTextInSingleRegion(/* existing body, untouched */);
  }
  return replaceTextMultiRegion(documentIndex, normalized, text);
}
```

`replaceTextMultiRegion`:

1. Resolve the **start root** and **end root** (the `EditorRoot` containing `normalized.start.regionId` and `normalized.end.regionId`). Nested regions — lists, blockquotes — resolve to their enclosing root.
2. Build a **prefix block** from the start root, truncated so its start-containing region ends at `normalized.start.offset` and nothing exists after that point in the root. Drop children and trailing content beyond the cut.
3. Build a **suffix block** from the end root, symmetrically: content before `normalized.end.offset` is dropped from the end-containing region; all earlier children of the root are dropped.
4. **Merge into a single block** (start-block-wins): if prefix and suffix are both text-like (paragraph/heading), concatenate as `[prefix.inlines + text + suffix.inlines]` in the start block's type. If either is atomic (code, table), see atomic-block rules below.
5. Drop all root blocks strictly between start and end.
6. Emit a `replace-root-range` transaction covering `[startRootIndex, endRootIndex]` inclusive with the result.
7. Update comment threads for all affected regions via `updateCommentThreadsForRegionEdit`: threads anchored inside deleted spans are dropped; straddling threads clamp to the boundary. Extending this helper to handle multi-region is part of this step.
8. **Empty-doc normalization**: if the result would produce zero root blocks, emit a single empty paragraph.
9. Return `{ documentIndex, selection: collapsedAtInsertionPoint }` — insertion point is at the start of the merged block plus `text.length`.

The **prefix/suffix trim** helpers — "build a truncated root block given a region and offset" — factor out as module-internal helpers in `replace.ts`. They'll be reused by Step 6 for slicing and for the `replaceBlocks` sibling.

**Atomic blocks** (code, table, thematic break, image-only blocks). These are blocks whose region cannot meaningfully merge with a text block via inline concatenation.

- If `normalized.start` is inside a code block, its source region *can* be trimmed at the offset (code blocks have a single-region text model). Treat like paragraph/heading for trimming. The "text-like merge with paragraph" rule does NOT apply: the result keeps the code block's type for the start side.
- If `normalized.start` is inside a table cell, the cell is atomic at the row/cell level. If the selection end is outside the table, the table is treated as fully included in the deletion (the table is dropped, the prefix and suffix merge according to the policy above). Partial-table selections that don't cross out of the table are single-region and go down the existing path.
- Thematic breaks / image-only blocks are 0-region atomic blocks — they are either fully included in the deletion or not.

The rule in one sentence: **a block is either wholly kept, wholly dropped, or trimmed-in-place; it's never split at a non-text boundary.**

#### Putting it all together

After 1a–1f, every existing cross-region *selection-producing* path works correctly end-to-end: shift+arrows, shift+cmd+arrows, shift+home/end (already fine), drag, select-all. Delete, backspace, type-to-replace all go through the extended `replaceText` and behave consistently.

### Layer 2 — Markdown clipboard

A sibling mutation path for structural inserts (`replaceBlocks` + `insertBlocks` + a new transaction kind), a slice helper, and a handler rewrite.

#### 2a. Sibling mutation: `replaceBlocks` — `replace.ts`

`replaceText` handles the text case and is kept as-is after Step 4. The block-insert case gets a **parallel function** in the same file:

```ts
export function replaceBlocks(
  documentIndex: DocumentIndex,
  selection: EditorSelection,
  blocks: Block[],
): { documentIndex: DocumentIndex; selection: EditorSelection }
```

Flow mirrors `replaceTextMultiRegion` from Step 4 but with the paste merge heuristic at step 4 of the algorithm replacing the plain text-concatenation rule:

- **`blocks.length === 1` and it's a paragraph**: treat as inline content. Merge inlines into `prefix + suffix` just like `replaceText` would with that paragraph's inline text. Result: one block.
- **`blocks[0]` is a paragraph AND prefix is text-like**: merge `blocks[0]`'s inlines into prefix. Remaining `blocks[1..]` are inserted as siblings.
- **`blocks.at(-1)` is a paragraph AND suffix is text-like**: symmetric at the other end.
- **Otherwise**: emit `[prefix, ...blocks, suffix]` verbatim, subject to the atomic-block and empty-block pruning rules.

Reuses the prefix/suffix trim helpers factored out in Step 4.

#### 2b. Command + transaction — `commands.ts`, `types.ts`

New transaction kind in `src/editor/model/types.ts`:

```ts
| {
    kind: "replace-selection-blocks";
    selection: EditorSelection;
    blocks: Block[];
  }
```

Dispatched in `commitTransaction` to `replaceBlocks`.

New command in `src/editor/model/commands.ts`, next to `replaceSelectionText`:

```ts
export function replaceSelectionBlocks(state: EditorState, blocks: Block[]) {
  return commitTransaction(state, {
    kind: "replace-selection-blocks",
    selection: state.selection,
    blocks,
  });
}
```

No animation wrapper for v1 — `replaceSelectionText` has `insertSelectionText` on top because typed/inserted text gets a green-flash highlight; pasted blocks don't currently have an animation and shouldn't acquire one by default. A future "pasted content" animation can slot in as a sibling wrapper the same way.

#### 2c. Public API — `api.ts`

New entry on `EditorApi`, named parallel to `insertText`:

```ts
insertBlocks(state: EditorState, blocks: Block[]): EditorStateChange;
```

Wired via `createDocumentChangeHandler(replaceSelectionBlocks)`. The existing `replaceSelection(state, text)` stays exactly as it is — same signature, same wiring, same animation semantics for typed/pasted text.

#### 2d. Slice — `src/editor/model/selection-slice.ts` (new)

```ts
export function sliceSelection(index: DocumentIndex, selection: EditorSelection): Block[]
```

Reuses the Step 4 prefix/suffix trim helpers. For single-region selections, returns a one-element `Block[]` with the block's content trimmed to the selection's inline range.

Serialization is then `serializeMarkdown(createDocument(blocks, []))` — no new serializer; the existing one handles trimmed blocks without special-casing.

Parsing is `parseMarkdown(source).blocks` — no wrapper needed.

#### 2e. Clipboard handlers — `useInput.ts`

Replace the three handlers at 361-400:

```ts
const handleCopy = useEffectEvent((event) => {
  const state = readCurrentState();
  if (isSelectionCollapsed(state.selection)) return;
  const markdown = serializeMarkdown(createDocument(
    sliceSelection(state.documentIndex, state.selection),
    [],
  ));
  event.preventDefault();
  event.clipboardData.setData("text/plain", markdown);
  event.clipboardData.setData("text/markdown", markdown);
});

const handleCut = useEffectEvent((event) => {
  const state = readCurrentState();
  if (isSelectionCollapsed(state.selection)) return;
  const markdown = serializeMarkdown(createDocument(
    sliceSelection(state.documentIndex, state.selection),
    [],
  ));
  event.preventDefault();
  event.clipboardData.setData("text/plain", markdown);
  event.clipboardData.setData("text/markdown", markdown);
  applyStateChange(editor.deleteSelection(state));
});

const handlePaste = useEffectEvent((event) => {
  const md = event.clipboardData.getData("text/markdown");
  const text = event.clipboardData.getData("text/plain");
  if (!md && !text) return;
  event.preventDefault();
  const state = readCurrentState();
  if (md) {
    applyStateChange(editor.insertBlocks(state, parseMarkdown(md).blocks));
  } else {
    applyStateChange(editor.replaceSelection(state, text));
  }
});
```

The text path (`editor.replaceSelection`) is unchanged. The block path (`editor.insertBlocks`) is the new sibling.

`readSingleContainerSelectionText` and its friends in `src/component/lib/selection.ts` are no longer called; delete them.

### Paste merge heuristic (recap)

The heuristic inside `replaceBlocks` (§2a) is a pure function of the block shape:

- **Length 1, paragraph** → inline merge into start block's type.
- **First block paragraph + prefix text-like** → merge first block inlines into prefix; rest are siblings.
- **Last block paragraph + suffix text-like** → symmetric.
- **Otherwise** → insert as standalone siblings.

This is lossy in the "copy half-para-A + all-para-B + half-para-C, paste mid-para-D" case — result is 4 paragraphs instead of the platonic 2. Acceptable for v1. Lossless within-editor fragment round-trip would need a custom MIME type encoding slice metadata (see §Step 7).

## Sequencing

Seven steps. Each is independently shippable and individually user-visible.

### Step 1 — Painting across regions (§1a)

**Changes:** `paint.ts` only.
**Ships:** Highlight renders for shift+← across paragraph boundary.
**Test:** Playground. Unit test for `paintCanvasSelectionHighlight` with synthetic cross-region selection.

### Step 2 — Drop the drag clamp (§1b)

**Changes:** `hit-test.ts` 3-line deletion.
**Ships:** Mouse drag across blocks produces a cross-region selection that paints correctly.
**Test:** Unit test for `resolveDragFocusPoint` returning cross-region focus. Playground drag-select.

### Step 3 — Vertical + doc-boundary motion (§1c, §1d)

**Changes:** `line.ts` (signature updates + two new primitives), `api.ts`, `keybindings.ts`, `useInput.ts` (forward `shiftKey`).
**Ships:** shift+↑/↓ extends across regions; `cmd+↑`/`cmd+↓` jump to doc ends; shift variants select to doc end/start.
**Test:** Unit tests in `test/editor/navigation/` for multi-region cases. Playground.

### Step 4 — Extend `replaceText` for cross-region (§1f)

**Changes:** `replace.ts` (remove throw, add `replaceTextMultiRegion`, extract `buildPrefixAtSelectionStart` / `buildSuffixAtSelectionEnd` as module-internal helpers). Extend `updateCommentThreadsForRegionEdit` to iterate the affected region range. No new files. Public `editor.replaceSelection(state, text: string)` signature is unchanged.
**Ships:** Delete, backspace, type-to-replace all work across any cross-region selection from Steps 1–3. `cmd+a` isn't bound yet, but a manually-constructed cross-region selection exercises the full path.
**Test:**
- Unit: every combination of {start mid-block, start at boundary} × {end mid-block, end at boundary} × {empty, text}.
- Unit: atomic-block rules (code block on one side, table fully included, thematic break in middle).
- Unit: empty-doc normalization.
- Unit: comment thread repair across multi-region edits.
- Golden: add a fixture for "whole-doc replaced with `x`" — confirm markdown output is `x`.

### Step 5 — `selectAll` + `cmd+a` (§1e)

**Changes:** `api.ts` (one command), `keybindings.ts` (one binding).
**Ships:** `cmd+a` highlights the whole document; `cmd+a` + Backspace collapses to empty paragraph; `cmd+a` + typing "x" replaces the doc with `x`.
**Test:** Unit test for the command. Playground.

### Step 6 — Markdown clipboard (§2)

**Changes:**
- `replace.ts`: add `replaceBlocks` sibling to `replaceText`, reusing the prefix/suffix helpers from Step 4. Apply the paste merge heuristic.
- `types.ts`: add `replace-selection-blocks` transaction kind; dispatch in `commitTransaction` to `replaceBlocks`.
- `commands.ts`: add `replaceSelectionBlocks` command parallel to `replaceSelectionText`.
- `api.ts`: add `insertBlocks(state, blocks)` to the `EditorApi` interface, wired via `createDocumentChangeHandler(replaceSelectionBlocks)`. The existing `replaceSelection(state, text)` is untouched.
- New `src/editor/model/selection-slice.ts` with `sliceSelection`.
- `useInput.ts`: clipboard handlers rewritten to use `sliceSelection` + `serializeMarkdown` on copy/cut, and `parseMarkdown` + `editor.insertBlocks` on paste with `text/markdown`.
- Delete `readSingleContainerSelectionText` from `src/component/lib/selection.ts`.

**Ships:** Copy/cut produce markdown in both `text/plain` and `text/markdown`. Paste of `text/markdown` parses into structure via `insertBlocks`. Paste fallback is plain text as plain via the existing `replaceSelection`.
**Test:**
- Unit: `replaceBlocks` paste-merge heuristic — each branch (single paragraph, first-paragraph merge, last-paragraph merge, all-standalone).
- Unit: `sliceSelection` round-trips. Golden: `serializeMarkdown(sliceSelection(doc, fullDocSelection))` equals `serializeMarkdown(doc)` up to trailing-newline conventions.
- Unit: copy handler sets both MIME types. Paste handler picks markdown when both present, plain when only `text/plain`.
- Playground: copy paragraph with bold + link → paste elsewhere → formatting preserved. Copy a list → paste elsewhere → structure preserved. Paste markdown from an external source with `text/markdown` set.

### Step 7 — Optional follow-ups

Non-blocking. Pick up as needed:

- `text/html` on copy (pasting into Google Docs / Notion / email) via a markdown→HTML pass.
- Custom MIME type (`application/x-documint-fragment`) encoding slice metadata so within-editor fragment round-trips merge losslessly.
- Double-click word select across regions (`resolveWordSelectionAtPoint`).
- Alt+← / Alt+→ word motion.
- Trailing line-break tick on multi-region highlights for visual clarity at line ends.
- "Paste as Markdown" command for explicit markdown parse of `text/plain`.

## Policy decisions

Lock these in before implementation:

1. **Boundary merge: start-block-wins.** The result uses the start block's type with merged inline content from the suffix block.
2. **Atomic blocks trim or vanish, never split partially into another type.** Code block source trims like any single-region text; tables are included whole if the selection exits them; thematic breaks are included whole.
3. **Empty-doc normalization.** Any mutation leaving zero root blocks produces a single empty paragraph.
4. **`text/plain` on copy carries markdown.** A markdown editor should emit markdown syntax as its plain-text projection. Easy to change in one place if feedback contradicts.
5. **`text/plain` on paste is treated as plain.** No implicit markdown parsing without `text/markdown` signal. URLs / code snippets / non-markdown sources pass through intact.
6. **Comments inside deleted spans are dropped; straddling comments clamp.** Matches existing single-region semantics.
7. **No clamping at the selection layer.** Drag, motion, and select-all all produce whatever selection the user asks for; the mutation layer handles atomic-block semantics uniformly. This keeps selection producers simple and policy in one place.

## Non-goals

- Multi-cell table selection.
- Block-structural selection (selecting whole blocks without inline offsets). The inline-offset slice model covers stated requirements.
- Rich-HTML paste (Step 7 territory).
- Preserving exact markdown syntax choice on round-trip (`*` vs `_`) — serializer conventions apply.
- Multi-region-aware input bridge. Typing into a cross-region selection *replaces* it first (Step 4), so the textarea window-around-caret model is unaffected.

## Files touched (index)

| Step | File | Change |
| --- | --- | --- |
| 1 | `src/editor/render/paint.ts` | Per-line overlap against selection range. |
| 2 | `src/editor/layout/hit-test.ts` | Remove cross-region drag clamp. |
| 3 | `src/editor/navigation/line.ts` | `moveCaretVerticallyInFlow` / `moveCaretByViewportInFlow` accept `extendSelection`. Add `moveCaretToDocumentStart` / `moveCaretToDocumentEnd`. |
| 3 | `src/editor/api.ts` | Surface new primitives; forward shift to vertical motion. |
| 3 | `src/component/hooks/useInput.ts` | Forward `event.shiftKey` on ArrowUp/Down. |
| 3, 5 | `src/component/lib/keybindings.ts` | `cmd+↑/↓`, `cmd+a`. |
| 4 | `src/editor/model/mutations/text/replace.ts` | Remove throw; add `replaceTextMultiRegion`; extract prefix/suffix trim helpers; atomic-block handling. |
| 4 | `src/editor/annotations/` | Extend `updateCommentThreadsForRegionEdit` for multi-region. |
| 4 | `src/document/` | Any structural trim helpers that emerge (`rebuildListBlock` shape peers), if not already present. |
| 5 | `src/editor/api.ts` | `selectAll`. |
| 6 | `src/editor/model/mutations/text/replace.ts` | Add `replaceBlocks` sibling reusing Step 4's trim helpers; implement paste merge heuristic. |
| 6 | `src/editor/model/types.ts` | New `replace-selection-blocks` transaction kind. |
| 6 | `src/editor/model/state.ts` (or wherever `commitTransaction` dispatches) | Dispatch `replace-selection-blocks` to `replaceBlocks`. |
| 6 | `src/editor/model/commands.ts` | `replaceSelectionBlocks` command parallel to `replaceSelectionText`. |
| 6 | `src/editor/api.ts` | Add `insertBlocks` to `EditorApi`, wire via `createDocumentChangeHandler(replaceSelectionBlocks)`. |
| 6 | `src/editor/model/selection-slice.ts` (new) | `sliceSelection` reusing Step 4's trim helpers. |
| 6 | `src/component/hooks/useInput.ts` | Copy/cut/paste handlers use `sliceSelection` + `serializeMarkdown` / `parseMarkdown` + `editor.insertBlocks`. |
| 6 | `src/component/lib/selection.ts` | Delete `readSingleContainerSelectionText` (no remaining callers). |

One new file total (`selection-slice.ts` in Step 6). Everything else is an extension of existing files. `replaceSelection(state, text)`'s public signature and wiring are preserved; `insertBlocks` is added as a sibling rather than overloaded on top.

## Definition of done (per `AGENTS.md`)

1. `cmd+a`, cross-region delete, type-to-replace, copy/cut/paste all work in the playground.
2. Unit tests pass, including new multi-region cases and slice round-trip.
3. Markdown golden tests pass — no round-trip regressions.
4. Undo/redo across cross-region mutations is clean (each `replaceTextMultiRegion` / `replaceBlocks` call is one history entry).
5. Comments on unaffected regions are untouched; comments inside deleted spans are dropped; straddling comments clamp.
6. Paint / layout benchmarks do not materially regress.
