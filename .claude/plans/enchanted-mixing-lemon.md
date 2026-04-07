# Collapse the API facade layer

## Context

`api.ts` exists as a pass-through layer that wraps ~35 command functions 
(`EditorState → EditorState | null`) into `EditorStateChange` results 
(`{ state, documentChanged, animationStarted }`). The wrapping is mechanical — 
every command method is either `createDocumentChangeHandler(command)` or a manual 
`createTransitionEditorStateChange(state, command(state), false)`. This creates 
~500 lines of ceremony (200-line `Editor` type + 290-line implementation) for 
two boolean flags that can be derived from state identity comparison.

The `Editor` facade also holds query, layout, hit-testing, and paint methods 
that are pure delegation — forwarding args with minor destructuring. The only 
stateful reason the facade exists is to close over a `CanvasRenderCache` used 
by a single method (`prepareViewport`).

**Goal**: Eliminate the `Editor` facade and `EditorStateChange` type. Components 
call state functions directly. The two flags are derived at the single consumption 
point (`applyEditorStateChange` in `Documint.tsx`).

## Why derivation works

- **`documentChanged`**: `setSelection()` in `state.ts` spreads the state with a 
  new selection but keeps the same `documentIndex`. `pushHistory()` always creates 
  a new `documentIndex`. So `prev.documentIndex !== next.documentIndex` reliably 
  detects document mutations.

- **`animationStarted`**: Already derived today via `startedNewAnimation()` which 
  compares animation timestamps between prev/next state. Same logic, just moved to 
  the consumption point.

## Changes

### 1. Push misplaced logic out of api.ts into state layer

**`getSelectionMarks`** (api.ts:405-431) — 25 lines of query logic over 
document index + selection. Move to `state/selection.ts` alongside 
`getSelectionContext` and `normalizeSelection`.

**Comment thread operations** (api.ts:441-478 + helper at 743-766) — 
State mutation logic that calls `spliceEditorCommentThreads`. Move to 
`state/commands.ts` as new command functions (`createCommentThread`, 
`replyToCommentThread`, `editComment`, `deleteComment`, `deleteCommentThread`, 
`markCommentThreadAsResolved`).

Files: `src/editor/state/selection.ts`, `src/editor/state/commands.ts`

### 2. Move render cache to useViewport

The `CanvasRenderCache` is created in `createEditor()` but only consumed by 
`prepareViewport` → `createDocumentViewport`. Move cache creation into 
`useViewport.ts` where it's actually used:

```ts
// useViewport.ts
const renderCacheRef = useRef(createCanvasRenderCache());
```

Extract `prepareViewport` as a standalone function (in `layout/` or keep 
in a slimmed api.ts) that accepts the cache as a parameter.

Files: `src/component/hooks/useViewport.ts`, `src/editor/layout/viewport.ts`

### 3. Remove `EditorStateChange` and derive flags at consumption point

Replace `applyEditorStateChange(change: EditorStateChange | null)` in 
`Documint.tsx` with `applyNextState(nextState: EditorState | null)`:

```ts
const applyNextState = useEffectEvent((nextState: EditorState | null) => {
  if (!nextState) return;

  const prevState = editorStateRef.current;
  const documentChanged = prevState.documentIndex !== nextState.documentIndex;
  const animationStarted = hasNewAnimation(prevState, nextState);

  editorStateRef.current = nextState;
  setEditorState(nextState);

  // ... rest of effects using documentChanged, animationStarted
});
```

Move `startedNewAnimation` to the state layer (e.g. `state/animations.ts` or 
`state/state.ts`) and export it as `hasNewAnimation`.

Files: `src/component/Documint.tsx`, `src/editor/state/animations.ts`

### 4. Update component hooks to work with `EditorState | null` directly

**`useInput.ts`**: 
- Remove `EditorStateChange` imports
- `applyStateChange` callback becomes `(nextState: EditorState | null) => void`
- The accumulation loop in `applyNativeText` simplifies — just threads state:
  ```ts
  for (const segment of segments) {
    nextState = insertText(nextState, segment) ?? nextState;
  }
  return nextState === state ? null : nextState;
  ```
- `applyKeyboardEvent` returns `EditorState | null` instead of `EditorStateChange | null`
- Import commands directly instead of going through `editor.`

**`useSelection.ts`**: 
- `onEditorStateChange` callback becomes `(nextState: EditorState) => void`
- Calls `setSelection(state, selection)` directly (already imported from state layer)

**Canvas pointer handlers in `Documint.tsx`**:
- Call commands/state functions directly instead of `editor.methodName()`
- All return `EditorState | null`, passed to `applyNextState`

Files: `src/component/hooks/useInput.ts`, `src/component/hooks/useSelection.ts`, 
`src/component/Documint.tsx`

### 5. Flatten remaining query/layout/paint calls

Hooks that use query methods call state functions directly:
- `editor.normalizeSelection(state)` → `normalizeSelection(state.documentIndex, state.selection)`
- `editor.getSelectionMarks(state)` → `getSelectionMarks(state)` (after step 1 moves it)
- `editor.getCommentState(state)` → `getCommentState(state.documentIndex)`
- `editor.getSelectionContext(state)` → `getSelectionContext(state.documentIndex, state.selection.anchor)`
- `editor.hasRunningAnimations(state)` → `hasRunningEditorAnimations(state)`

Layout/hit-testing calls pass `viewport.layout` directly:
- `editor.resolveSelectionHit(state, viewport, point)` → `resolveEditorHitAtPoint(viewport.layout, state, point) ?? resolveHitBelowLayout(...)`
- Similar for `resolveDragFocus`, `resolveWordSelection`, `resolveHoverTarget`, etc.

Paint calls pass args directly to canvas functions.

Files: `src/component/hooks/useCursor.ts`, `src/component/hooks/useHover.ts`, 
`src/component/hooks/usePresence.ts` (if it exists), `src/component/Documint.tsx`

### 6. Remove `Editor` type, `createEditor`, and slim down api.ts

- Delete the `Editor` type definition and `createEditor` factory
- Delete `useEditor.ts` hook (no longer needed)
- Keep `EditorCommand` type (used by keybindings) — move to `keybindings.ts` 
  or a shared types file
- Keep viewport-related types (`EditorViewportState`, `EditorViewport`, 
  `EditorPoint`, `SelectionHit`, `ContainerLineBounds`) — move to layout module 
  or keep in a slimmed `api.ts`
- Update `src/editor/index.ts` barrel exports

Files: `src/editor/api.ts`, `src/component/hooks/useEditor.ts`, 
`src/editor/index.ts`, `src/component/lib/keybindings.ts`

## Result

**Before (3 layers)**:
```
Actions:  (DocumentIndex, Selection) → EditorAction | null
Commands: (EditorState)              → EditorState | null  
API:      (EditorState)              → EditorStateChange | null  ← ceremony
```

**After (2 layers)**:
```
Actions:  (DocumentIndex, Selection) → EditorAction | null
Commands: (EditorState)              → EditorState | null  ← components call these directly
```

The layering becomes: actions resolve intent, commands orchestrate and apply. 
Components call commands, derive change metadata once at the dispatch boundary.

## Verification

1. `npx tsc --noEmit` — type check passes
2. `npm test` — all existing tests pass (tests already call commands directly)
3. Manual: verify text editing, formatting, undo/redo, comments, tables, 
   navigation, animations, and viewport scrolling all work correctly
