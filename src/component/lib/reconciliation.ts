// Host-side reconciliation for external content snapshots. This module keeps
// focus sticky across a rebuilt editor state without entering the local editing
// transaction path.
//
// Reconciles:
// - equivalent selections across stable, moved, or edited text regions
// - cursor/range offsets when text is inserted or deleted around the selection
// - transient empty root paragraphs that markdown rebuilds cannot represent
//
// Intentionally does not attempt full document rebase. Ambiguous duplicate
// regions, structural rewrites, nested empty blocks, and deleted selection
// endpoints fall back to the caller's reload behavior.
import {
  createRootPrimaryRegionTarget,
  resolveSelectionTarget,
  setSelection,
  spliceDocumentIndex,
  type EditorRegion,
  type EditorSelection,
  type EditorSelectionPoint,
  type EditorState,
} from "@/editor/model";
import { createParagraphTextBlock, spliceDocument } from "@/document";

const offsetContextWindow = 24;
type OffsetAffinity = "after-prefix" | "before-suffix" | "neutral";
type RootScanDirection = "after" | "before";

export type ExternalContentReconciliation = {
  didReconcile: boolean;
  state: EditorState;
};

export function reconcileExternalContentChange(
  previousState: EditorState | null,
  nextState: EditorState,
): ExternalContentReconciliation {
  if (!previousState) {
    return unreconciled(nextState);
  }

  // Prefer semantic region/offset repair. Recreate transient empty paragraphs
  // only when normal selection reconciliation cannot find an equivalent point.
  const restoredState =
    restoreEquivalentSelection(previousState, nextState) ??
    restoreTransientEmptyParagraphSelection(previousState, nextState);

  return restoredState ? reconciled(restoredState) : unreconciled(nextState);
}

function reconciled(state: EditorState): ExternalContentReconciliation {
  return {
    didReconcile: true,
    state,
  };
}

function unreconciled(state: EditorState): ExternalContentReconciliation {
  return {
    didReconcile: false,
    state,
  };
}

export function restoreEquivalentSelection(
  previousState: EditorState,
  nextState: EditorState,
): EditorState | null {
  const equivalentSelection = resolveEquivalentSelection(previousState, nextState);

  return equivalentSelection ? setSelection(nextState, equivalentSelection, false) : null;
}

export function resolveEquivalentSelection(
  previousState: EditorState,
  nextState: EditorState,
): EditorSelection | null {
  if (areSelectionPointsEqual(previousState.selection.anchor, previousState.selection.focus)) {
    const point = resolveEquivalentSelectionPoint(
      previousState,
      nextState,
      previousState.selection.focus,
      "neutral",
    );

    return point ? { anchor: point, focus: point } : null;
  }

  const selectionAffinity = resolveSelectionPointAffinity(previousState);
  const anchor = resolveEquivalentSelectionPoint(
    previousState,
    nextState,
    previousState.selection.anchor,
    selectionAffinity.anchor,
  );
  const focus = resolveEquivalentSelectionPoint(
    previousState,
    nextState,
    previousState.selection.focus,
    selectionAffinity.focus,
  );

  return anchor && focus ? { anchor, focus } : null;
}

function resolveEquivalentSelectionPoint(
  previousState: EditorState,
  nextState: EditorState,
  point: EditorSelectionPoint,
  affinity: OffsetAffinity,
): EditorSelectionPoint | null {
  const previousRegion = previousState.documentIndex.regionIndex.get(point.regionId);

  if (!previousRegion) {
    return null;
  }

  const nextRegion = resolveEquivalentRegion(previousRegion, nextState);

  if (!nextRegion) {
    return null;
  }

  return {
    offset: resolveEquivalentOffset(previousRegion.text, nextRegion.text, point.offset, affinity),
    regionId: nextRegion.id,
  };
}

function resolveEquivalentRegion(previousRegion: EditorRegion, nextState: EditorState) {
  const sameIdRegion = nextState.documentIndex.regionIndex.get(previousRegion.id);

  if (sameIdRegion) {
    return sameIdRegion;
  }

  // Empty text is not a stable semantic anchor: markdown rebuilds can drop
  // transient empty paragraphs, and path matching could point at unrelated text.
  if (previousRegion.text.length === 0) {
    return null;
  }

  // Path-based matching is intentionally after unique text matching because
  // paths can shift when external content inserts blocks above the selection.
  const uniqueTextRegion = resolveUniqueTextRegion(previousRegion, nextState);

  if (uniqueTextRegion) {
    return uniqueTextRegion;
  }

  const samePathRegion = nextState.documentIndex.regionPathIndex.get(previousRegion.path);

  if (samePathRegion) {
    return samePathRegion;
  }

  return null;
}

function restoreTransientEmptyParagraphSelection(
  previousState: EditorState,
  nextState: EditorState,
) {
  if (!areSelectionPointsEqual(previousState.selection.anchor, previousState.selection.focus)) {
    return null;
  }

  const previousRegion = resolveSelectedEmptyRootParagraph(previousState);

  if (!previousRegion) {
    return null;
  }

  const insertionRootIndex = resolveRecreatedEmptyParagraphRootIndex(
    previousState,
    nextState,
    previousRegion,
  );

  if (insertionRootIndex === null) {
    return null;
  }

  return recreateEmptyRootParagraphSelection(nextState, insertionRootIndex);
}

function resolveSelectedEmptyRootParagraph(state: EditorState) {
  const region = state.documentIndex.regionIndex.get(state.selection.focus.regionId);

  if (!region || region.blockType !== "paragraph" || region.text.length > 0) {
    return null;
  }

  const block = state.documentIndex.blockIndex.get(region.blockId);

  return block?.parentBlockId === null ? region : null;
}

function recreateEmptyRootParagraphSelection(nextState: EditorState, rootIndex: number) {
  const nextDocument = spliceDocument(nextState.documentIndex.document, rootIndex, 0, [
    createParagraphTextBlock({ text: "" }),
  ]);
  const restoredState = {
    ...nextState,
    documentIndex: spliceDocumentIndex(nextState.documentIndex, nextDocument, rootIndex, 0),
  };
  const selection = resolveSelectionTarget(
    restoredState.documentIndex,
    createRootPrimaryRegionTarget(rootIndex),
  );

  return selection ? setSelection(restoredState, selection, false) : null;
}

function resolveRecreatedEmptyParagraphRootIndex(
  previousState: EditorState,
  nextState: EditorState,
  previousRegion: EditorRegion,
) {
  // A transient empty paragraph is restored by anchoring it to the nearest
  // surviving non-empty root content around its previous position. Structural
  // roots without their own text use a child region as the stable anchor.
  const precedingRegion = resolveNearestNonEmptyRootAnchorRegion(
    previousState,
    previousRegion.rootIndex,
    "before",
  );
  const followingRegion = resolveNearestNonEmptyRootAnchorRegion(
    previousState,
    previousRegion.rootIndex,
    "after",
  );
  const precedingMatch = precedingRegion
    ? resolveEquivalentRegion(precedingRegion, nextState)
    : null;
  const followingMatch = followingRegion
    ? resolveEquivalentRegion(followingRegion, nextState)
    : null;

  if (precedingMatch && followingMatch) {
    return precedingMatch.rootIndex < followingMatch.rootIndex ? followingMatch.rootIndex : null;
  }

  if (precedingMatch) {
    return precedingMatch.rootIndex + 1;
  }

  if (followingMatch) {
    return followingMatch.rootIndex;
  }

  return null;
}

function resolveNearestNonEmptyRootAnchorRegion(
  state: EditorState,
  rootIndex: number,
  direction: RootScanDirection,
) {
  const step = direction === "before" ? -1 : 1;

  for (
    let index = rootIndex + step;
    index >= 0 && index < state.documentIndex.roots.length;
    index += step
  ) {
    const region = resolveRootAnchorRegion(state, index, direction);

    if (!region) {
      continue;
    }

    return region;
  }

  return null;
}

function resolveRootAnchorRegion(
  state: EditorState,
  rootIndex: number,
  direction: RootScanDirection,
) {
  const regions = state.documentIndex.roots[rootIndex]?.regions ?? [];
  const start = direction === "before" ? regions.length - 1 : 0;
  const step = direction === "before" ? -1 : 1;

  for (let index = start; index >= 0 && index < regions.length; index += step) {
    const region = regions[index];

    if (region && region.text.length > 0) {
      return region;
    }
  }

  return null;
}

function resolveUniqueTextRegion(previousRegion: EditorRegion, nextState: EditorState) {
  let match: EditorRegion | null = null;

  for (const candidate of nextState.documentIndex.regions) {
    if (
      candidate.blockType !== previousRegion.blockType ||
      candidate.text !== previousRegion.text
    ) {
      continue;
    }

    if (match) {
      return null;
    }

    match = candidate;
  }

  return match;
}

function resolveEquivalentOffset(
  previousText: string,
  nextText: string,
  offset: number,
  affinity: OffsetAffinity,
) {
  const previousOffset = clamp(offset, 0, previousText.length);
  const prefix = previousText.slice(
    Math.max(0, previousOffset - offsetContextWindow),
    previousOffset,
  );
  const suffix = previousText.slice(
    previousOffset,
    Math.min(previousText.length, previousOffset + offsetContextWindow),
  );

  const contextOffset = resolveOffsetBetweenContext(nextText, prefix, suffix);

  if (contextOffset !== null) {
    return contextOffset;
  }

  const prefixOffset = resolveOffsetAfterUniquePrefix(nextText, prefix);
  const suffixOffset = resolveOffsetBeforeUniqueSuffix(nextText, suffix);

  if (affinity === "before-suffix") {
    return suffixOffset ?? prefixOffset ?? clamp(offset, 0, nextText.length);
  }

  return prefixOffset ?? suffixOffset ?? clamp(offset, 0, nextText.length);
}

function resolveOffsetBetweenContext(text: string, prefix: string, suffix: string) {
  if (prefix.length === 0 || suffix.length === 0) {
    return null;
  }

  let resolvedOffset: number | null = null;
  let prefixSearchIndex = 0;

  while (prefixSearchIndex <= text.length) {
    const prefixIndex = text.indexOf(prefix, prefixSearchIndex);

    if (prefixIndex === -1) {
      break;
    }

    const offset = prefixIndex + prefix.length;

    if (text.startsWith(suffix, offset)) {
      if (resolvedOffset !== null) {
        return null;
      }

      resolvedOffset = offset;
    }

    prefixSearchIndex = prefixIndex + Math.max(1, prefix.length);
  }

  return resolvedOffset;
}

function resolveOffsetAfterUniquePrefix(text: string, prefix: string) {
  if (prefix.length === 0) {
    return null;
  }

  const index = resolveUniqueSubstringIndex(text, prefix);

  return index === null ? null : index + prefix.length;
}

function resolveOffsetBeforeUniqueSuffix(text: string, suffix: string) {
  return suffix.length === 0 ? null : resolveUniqueSubstringIndex(text, suffix);
}

function resolveUniqueSubstringIndex(text: string, query: string) {
  let match: number | null = null;
  let searchIndex = 0;

  while (searchIndex <= text.length) {
    const index = text.indexOf(query, searchIndex);

    if (index === -1) {
      break;
    }

    if (match !== null) {
      return null;
    }

    match = index;
    searchIndex = index + Math.max(1, query.length);
  }

  return match;
}

function resolveSelectionPointAffinity(state: EditorState): {
  anchor: OffsetAffinity;
  focus: OffsetAffinity;
} {
  const { anchor, focus } = state.selection;

  if (areSelectionPointsEqual(anchor, focus)) {
    return {
      anchor: "neutral",
      focus: "neutral",
    };
  }

  // Range starts should stay before the selected text; range ends should stay
  // after it. Reverse selections preserve the user's original anchor/focus.
  return compareSelectionPoints(state, anchor, focus) <= 0
    ? {
        anchor: "before-suffix",
        focus: "after-prefix",
      }
    : {
        anchor: "after-prefix",
        focus: "before-suffix",
      };
}

function compareSelectionPoints(
  state: EditorState,
  left: EditorSelectionPoint,
  right: EditorSelectionPoint,
) {
  const leftRegionIndex = state.documentIndex.regionOrderIndex.get(left.regionId);
  const rightRegionIndex = state.documentIndex.regionOrderIndex.get(right.regionId);

  if (leftRegionIndex === undefined || rightRegionIndex === undefined) {
    return 0;
  }

  return leftRegionIndex === rightRegionIndex
    ? left.offset - right.offset
    : leftRegionIndex - rightRegionIndex;
}

function areSelectionPointsEqual(left: EditorSelectionPoint, right: EditorSelectionPoint) {
  return left.regionId === right.regionId && left.offset === right.offset;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}
