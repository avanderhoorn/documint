import {
  createDocument,
  spliceCommentThreads,
  trimTrailingWhitespace,
  type Document,
} from "@/document";
import type { CommentThread } from "@/comments";
import { getCommentState } from "../annotations";
import {
  addActiveBlockFlashAnimation,
  type EditorAnimation,
  getEditorAnimationTime,
  pruneEditorAnimations,
  resolveFocusedBlockPath,
} from "./animations";
import { createDocumentIndex, replaceIndexedDocument } from "./build";
import type { DocumentIndex, EditorTransaction } from "./types";
import {
  resolveRegion,
  resolveSelectionTarget,
  type EditorSelection,
  type EditorSelectionPoint,
} from "./selection";
import { applyDocumentMutation } from "./mutations";

// Editor state machine: manages EditorState transitions including history,
// selection, undo/redo, and transaction commit.

type HistoryEntry = {
  document: Document;
  selection: EditorSelection;
};

export type EditorState = {
  // Transient paint animations belong to editor runtime state, not persisted document state.
  animations: EditorAnimation[];
  documentIndex: DocumentIndex;
  future: HistoryEntry[];
  history: HistoryEntry[];
  selection: EditorSelection;
};

export function createEditorState(document: Document): EditorState {
  const documentIndex = createDocumentIndex(document);
  const initialPoint = resolveDefaultSelectionPoint(documentIndex);

  return {
    animations: [],
    future: [],
    history: [],
    documentIndex,
    selection: {
      anchor: initialPoint,
      focus: initialPoint,
    },
  };
}

export function createDocumentFromEditorState(state: EditorState) {
  const commentState = getCommentState(state.documentIndex);

  return createDocument(
    trimTrailingWhitespace(state.documentIndex.document.blocks),
    commentState.threads,
  );
}

export function setSelection(
  state: EditorState,
  selection: EditorSelection | EditorSelectionPoint,
  activeBlockChanged?: boolean,
): EditorState {
  const nextSelection: EditorSelection =
    "regionId" in selection
      ? {
          anchor: clampSelectionPoint(state.documentIndex, selection),
          focus: clampSelectionPoint(state.documentIndex, selection),
        }
      : {
          anchor: clampSelectionPoint(state.documentIndex, selection.anchor),
          focus: clampSelectionPoint(state.documentIndex, selection.focus),
        };

  const nextState: EditorState = {
    ...state,
    selection: nextSelection,
  };

  const shouldFlash = activeBlockChanged ?? didActiveBlockChange(state, nextState);

  return shouldFlash
    ? addActiveBlockFlashAnimation(nextState, resolveFocusedBlockPath(nextState))
    : nextState;
}

export function pushHistory(
  state: EditorState,
  document: Document,
  documentIndex: DocumentIndex | null = null,
): EditorState {
  const nextDocumentIndex = documentIndex ?? createDocumentIndex(document);

  return {
    animations: pruneEditorAnimations(state.animations, getEditorAnimationTime()),
    future: [],
    documentIndex: nextDocumentIndex,
    history: [
      ...state.history,
      { document: state.documentIndex.document, selection: state.selection },
    ],
    selection: createCollapsedSelectionAtDefaultPoint(nextDocumentIndex),
  };
}

export function commitTransaction(state: EditorState, transaction: EditorTransaction): EditorState;
export function commitTransaction(
  state: EditorState,
  transaction: EditorTransaction | null,
): EditorState | null;
export function commitTransaction(state: EditorState, transaction: EditorTransaction | null) {
  if (!transaction) {
    return null;
  }

  switch (transaction.kind) {
    case "keep-state":
      return state;
    case "set-selection":
      return setSelection(state, transaction.selection);
    default: {
      const result = applyDocumentMutation(state.documentIndex, transaction);

      if (!result) {
        return null;
      }

      const nextState = pushHistory(state, result.document, result.documentIndex ?? null);
      const resolvedSelection =
        resolveSelectionTarget(nextState.documentIndex, result.selection) ?? state.selection;
      const blockChanged = didActiveBlockChange(state, nextState, resolvedSelection);

      return setSelection(nextState, resolvedSelection, blockChanged);
    }
  }
}

export function spliceEditorCommentThreads(
  state: EditorState,
  index: number,
  count: number,
  threads: CommentThread[],
): EditorState {
  const document = spliceCommentThreads(state.documentIndex.document, index, count, threads);
  const documentIndex: DocumentIndex = replaceIndexedDocument(state.documentIndex, document);

  return {
    animations: pruneEditorAnimations(state.animations, getEditorAnimationTime()),
    documentIndex,
    future: [],
    history: [
      ...state.history,
      { document: state.documentIndex.document, selection: state.selection },
    ],
    selection: state.selection,
  };
}

export function undoEditorState(state: EditorState): EditorState {
  const previous = state.history.at(-1);

  if (!previous) {
    return state;
  }

  const documentIndex = createDocumentIndex(previous.document);

  return {
    animations: [],
    documentIndex,
    future: [{ document: state.documentIndex.document, selection: state.selection }, ...state.future],
    history: state.history.slice(0, -1),
    selection: previous.selection,
  };
}

export function redoEditorState(state: EditorState): EditorState {
  const next = state.future[0];

  if (!next) {
    return state;
  }

  const documentIndex = createDocumentIndex(next.document);

  return {
    animations: [],
    documentIndex,
    future: state.future.slice(1),
    history: [
      ...state.history,
      { document: state.documentIndex.document, selection: state.selection },
    ],
    selection: next.selection,
  };
}

function createCollapsedSelectionAtDefaultPoint(documentIndex: DocumentIndex): EditorSelection {
  const point = resolveDefaultSelectionPoint(documentIndex);

  return {
    anchor: point,
    focus: point,
  };
}

function resolveDefaultSelectionPoint(documentIndex: DocumentIndex): EditorSelectionPoint {
  return documentIndex.regions[0]
    ? { regionId: documentIndex.regions[0].id, offset: 0 }
    : { regionId: "empty", offset: 0 };
}

function clampSelectionPoint(
  documentIndex: DocumentIndex,
  point: EditorSelectionPoint,
): EditorSelectionPoint {
  const region = resolveRegion(documentIndex, point.regionId);

  if (!region) {
    return point;
  }

  return {
    regionId: region.id,
    offset: Math.max(0, Math.min(point.offset, region.text.length)),
  };
}

function didActiveBlockChange(
  previousState: EditorState,
  nextState: EditorState,
  nextSelection?: EditorSelection,
): boolean {
  const previousKey = resolveActiveBlockKey(previousState.documentIndex, previousState.selection);
  const nextKey = resolveActiveBlockKey(
    nextState.documentIndex,
    nextSelection ?? nextState.selection,
  );

  return nextKey !== null && nextKey !== previousKey;
}

function resolveActiveBlockKey(
  documentIndex: DocumentIndex,
  selection: EditorSelection,
): string | null {
  const focusedRegion = documentIndex.regionIndex.get(selection.focus.regionId);
  const focusedBlock = focusedRegion
    ? (documentIndex.blockIndex.get(focusedRegion.blockId) ?? null)
    : null;

  if (!focusedRegion || !focusedBlock?.path) {
    return null;
  }

  return focusedBlock.type === "table"
    ? `cell:${focusedRegion.path}`
    : `block:${focusedBlock.path}`;
}
