/**
 * Editor navigation helpers for caret motion and range extension. This
 * boundary keeps call sites semantic while splitting core line-based movement
 * from table-specific vertical overrides.
 */
import type { CaretTarget, ViewportLayout } from "../layout";
import { measureCaretTarget } from "../layout";
import { setSelectionPoint, type EditorState } from "../state";
import {
  moveCaretByViewportInFlow,
  moveCaretHorizontallyInFlow,
  moveCaretToCurrentLineBoundary,
  moveCaretVerticallyInFlow,
} from "./line";
import { moveCaretVerticallyInTable } from "./table";

export function moveCaretHorizontally(state: EditorState, delta: -1 | 1) {
  return moveCaretHorizontallyInFlow(state, delta, false);
}

export function extendSelectionHorizontally(state: EditorState, delta: -1 | 1) {
  return moveCaretHorizontallyInFlow(state, delta, true);
}

export function moveCaretVertically(
  state: EditorState,
  layout: ViewportLayout,
  direction: -1 | 1,
) {
  return applyVerticalMotion(state, layout, direction, false);
}

export function extendSelectionVertically(
  state: EditorState,
  layout: ViewportLayout,
  direction: -1 | 1,
) {
  return applyVerticalMotion(state, layout, direction, true);
}

export function moveCaretByViewport(
  state: EditorState,
  layout: ViewportLayout,
  direction: -1 | 1,
) {
  return applyViewportMotion(state, layout, direction, false);
}

export function extendSelectionByViewport(
  state: EditorState,
  layout: ViewportLayout,
  direction: -1 | 1,
) {
  return applyViewportMotion(state, layout, direction, true);
}

export function moveCaretToLineBoundary(
  state: EditorState,
  layout: ViewportLayout,
  boundary: "Home" | "End",
) {
  return moveCaretToCurrentLineBoundary(state, layout, boundary, false);
}

export function extendSelectionToLineBoundary(
  state: EditorState,
  layout: ViewportLayout,
  boundary: "Home" | "End",
) {
  return moveCaretToCurrentLineBoundary(state, layout, boundary, true);
}

export function moveCaretToDocumentBoundary(state: EditorState, boundary: "start" | "end") {
  return applyDocumentBoundaryMotion(state, boundary, false);
}

export function extendSelectionToDocumentBoundary(state: EditorState, boundary: "start" | "end") {
  return applyDocumentBoundaryMotion(state, boundary, true);
}

function applyVerticalMotion(
  state: EditorState,
  layout: ViewportLayout,
  direction: -1 | 1,
  extendSelection: boolean,
) {
  const caret = measureSelectionCaret(state, layout);

  if (!caret) {
    return state;
  }

  return (
    moveCaretVerticallyInTable(state, layout, caret, direction, extendSelection) ??
    moveCaretVerticallyInFlow(state, layout, caret, direction, extendSelection)
  );
}

function applyViewportMotion(
  state: EditorState,
  layout: ViewportLayout,
  direction: -1 | 1,
  extendSelection: boolean,
) {
  const caret = measureSelectionCaret(state, layout);

  if (!caret) {
    return state;
  }

  return moveCaretByViewportInFlow(state, layout, caret, direction, extendSelection);
}

function applyDocumentBoundaryMotion(
  state: EditorState,
  boundary: "start" | "end",
  extendSelection: boolean,
) {
  const regions = state.documentIndex.regions;
  const targetRegion = boundary === "start" ? regions[0] : regions.at(-1);

  if (!targetRegion) {
    return state;
  }

  return setSelectionPoint(
    state,
    targetRegion.id,
    boundary === "start" ? 0 : targetRegion.text.length,
    extendSelection,
  );
}

function measureSelectionCaret(state: EditorState, layout: ViewportLayout) {
  return measureCaretTarget(layout, state.documentIndex, {
    regionId: state.selection.focus.regionId,
    offset: state.selection.focus.offset,
  });
}

export type { CaretTarget };
