// The Editor facade type and createEditor() factory.
// Wraps standalone EditorState commands into EditorStateChange results
// and keeps browser-only effects localized here.
import { findBlockById, type Block, type Document, type Mark } from "@/document";
import {
  deleteCommentFromThread,
  editCommentInThread,
  markCommentThreadAsResolved,
  replyToCommentThread,
  type CommentThread,
} from "@/comments";
import {
  createCommentThreadForSelection,
  getCommentState,
  resolvePresenceCursors as resolvePresenceCursorTargets,
  resolvePresenceViewport as resolvePresenceViewportTargets,
  type EditorCommentState,
  type EditorPresence,
  type Presence,
} from "./annotations";
import { getCanvasEditablePreviewState, type CanvasEditablePreviewState } from "./preview-state";
import {
  createDocumentFromEditorState,
  createEditorState,
  normalizeSelection,
  resolveInlineCommandMarks,
  resolveInlineCommandTarget,
  spliceEditorCommentThreads,
  setSelection,
  type EditorSelection,
  type EditorSelectionPoint,
  type EditorState,
  type NormalizedEditorSelection,
} from "./model";
import { emptyDocumentResources, type DocumentResources } from "./resources";
import {
  extendSelectionToLineBoundary,
  extendSelectionHorizontally,
  moveCaretByViewport as moveCaretByViewportSelection,
  moveCaretHorizontally as moveCaretHorizontallySelection,
  moveCaretToLineBoundary as moveCaretToLineBoundarySelection,
  moveCaretVertically as moveCaretVerticallySelection,
} from "./navigation";
import { createCanvasRenderCache, type CanvasRenderCache } from "./render/cache";
import {
  createDocumentViewport,
  measureCaretTarget,
  resolveCaretVisualLeft,
  resolveDragFocusPointAtLocation as resolvePointerDragFocusPointAtLocation,
  resolveEditorHitAtPoint,
  resolveHitBelowLayout,
  resolveHoverTargetAtPoint,
  resolveTargetAtSelectionPoint,
  resolveWordSelectionAtPoint,
  type CaretTarget,
  type CanvasViewport,
  type EditorHoverTarget,
  type ViewportLayout,
  type LayoutOptions,
} from "./layout";
import { paintCanvasCaretOverlay, paintCanvasEditorSurface } from "./render/paint";
import type { EditorTheme } from "./render/theme";
import { hasRunningEditorAnimations } from "./render/animations";
import {
  insertText,
  insertLineBreak,
  deleteSelectionText,
  deleteBackward,
  deleteForward,
  toggleTaskItem,
  insertTable,
  insertTableColumn,
  deleteTableColumn,
  insertTableRow,
  deleteTableRow,
  deleteTable,
  updateInlineLink,
  removeInlineLink,
  indent,
  dedent,
  moveListItemUp,
  moveListItemDown,
  toggleBold,
  toggleItalic,
  toggleStrikethrough,
  toggleUnderline,
  toggleInlineCode,
  undo,
  redo,
  insertSelectionText,
} from "./model/commands";

export type ContainerLineBounds = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export type EditorStateChange = {
  animationStarted: boolean;
  documentChanged: boolean;
  state: EditorState;
};

export type EditorCommand =
  | "dedent"
  | "deleteBackward"
  | "indent"
  | "insertLineBreak"
  | "moveListItemDown"
  | "moveListItemUp"
  | "moveToLineEnd"
  | "moveToLineStart"
  | "redo"
  | "toggleBold"
  | "toggleInlineCode"
  | "toggleItalic"
  | "toggleStrikethrough"
  | "toggleUnderline"
  | "undo";

export type EditorViewport = {
  height: number;
  top: number;
};

export type EditorViewportState = {
  estimateRegionBounds: (regionId: string) => { bottom: number; top: number } | null;
  regionBounds: Map<string, ContainerLineBounds>;
  layout: ViewportLayout;
  paintHeight: number;
  paintTop: number;
  totalHeight: number;
  viewport: EditorViewport;
  blockMap: Map<string, Block>;
};

export type EditorPoint = {
  x: number;
  y: number;
};

export type SelectionHit = {
  regionId: string;
  offset: number;
};

export type { EditorSelectionPoint } from "./model";
export type { EditorHoverTarget };

export type Editor = {
  // State lifecycle
  getDocument(state: EditorState): Document;
  createState(document: Document): EditorState;

  // Queries
  getCommentState(state: EditorState): EditorCommentState;
  getPreviewState(state: EditorState): CanvasEditablePreviewState;
  resolvePresenceCursors(
    documentIndex: EditorState["documentIndex"],
    presence: Presence[],
  ): EditorPresence[];
  resolvePresenceViewport(
    state: EditorState,
    viewport: EditorViewportState,
    presence: EditorPresence[],
  ): EditorPresence[];
  getSelectionMarks(state: EditorState): Mark[];
  hasRunningAnimations(state: EditorState, now?: number): boolean;
  normalizeSelection(state: EditorState): NormalizedEditorSelection;

  // Comments
  createCommentThread(
    state: EditorState,
    selection: {
      endOffset: number;
      regionId: string;
      startOffset: number;
    },
    body: string,
  ): EditorStateChange | null;
  replyToCommentThread(
    state: EditorState,
    threadIndex: number,
    body: string,
  ): EditorStateChange | null;
  editComment(
    state: EditorState,
    threadIndex: number,
    commentIndex: number,
    body: string,
  ): EditorStateChange | null;
  deleteComment(
    state: EditorState,
    threadIndex: number,
    commentIndex: number,
  ): EditorStateChange | null;
  deleteCommentThread(state: EditorState, threadIndex: number): EditorStateChange | null;
  markCommentThreadAsResolved(
    state: EditorState,
    threadIndex: number,
    resolved: boolean,
  ): EditorStateChange | null;

  // Text editing
  insertText(state: EditorState, text: string): EditorStateChange | null;
  insertLineBreak(state: EditorState): EditorStateChange | null;
  deleteBackward(state: EditorState): EditorStateChange | null;
  deleteForward(state: EditorState): EditorStateChange | null;
  deleteSelection(state: EditorState): EditorStateChange;
  replaceSelection(state: EditorState, text: string): EditorStateChange;

  // Formatting
  toggleBold(state: EditorState): EditorStateChange | null;
  toggleItalic(state: EditorState): EditorStateChange | null;
  toggleStrikethrough(state: EditorState): EditorStateChange | null;
  toggleUnderline(state: EditorState): EditorStateChange | null;
  toggleInlineCode(state: EditorState): EditorStateChange | null;

  // Structure
  indent(state: EditorState): EditorStateChange | null;
  dedent(state: EditorState): EditorStateChange | null;
  moveListItemUp(state: EditorState): EditorStateChange | null;
  moveListItemDown(state: EditorState): EditorStateChange | null;
  toggleTaskItem(state: EditorState, listItemId: string): EditorStateChange | null;
  undo(state: EditorState): EditorStateChange | null;
  redo(state: EditorState): EditorStateChange | null;

  // Tables
  insertTable(state: EditorState, columnCount: number): EditorStateChange | null;
  insertTableColumn(state: EditorState, direction: "left" | "right"): EditorStateChange | null;
  deleteTableColumn(state: EditorState): EditorStateChange | null;
  insertTableRow(state: EditorState, direction: "above" | "below"): EditorStateChange | null;
  deleteTableRow(state: EditorState): EditorStateChange | null;
  deleteTable(state: EditorState): EditorStateChange | null;

  // Links
  updateLink(
    state: EditorState,
    regionId: string,
    startOffset: number,
    endOffset: number,
    url: string,
  ): EditorStateChange | null;
  removeLink(
    state: EditorState,
    regionId: string,
    startOffset: number,
    endOffset: number,
  ): EditorStateChange | null;

  // Selection and navigation
  setSelection(
    state: EditorState,
    selection: EditorSelection | EditorSelectionPoint,
  ): EditorStateChange;
  moveCaretHorizontally(
    state: EditorState,
    direction: -1 | 1,
    extendSelection?: boolean,
  ): EditorStateChange;
  moveCaretVertically(
    state: EditorState,
    layout: ViewportLayout,
    direction: -1 | 1,
  ): EditorStateChange;
  moveCaretByViewport(
    state: EditorState,
    layout: ViewportLayout,
    direction: -1 | 1,
  ): EditorStateChange;
  moveCaretToLineBoundary(
    state: EditorState,
    layout: ViewportLayout,
    boundary: "Home" | "End",
    extendSelection?: boolean,
  ): EditorStateChange;

  // Layout and hit-testing
  prepareViewport(
    state: EditorState,
    options: Partial<LayoutOptions> & Pick<LayoutOptions, "width"> & EditorViewport,
    resources?: DocumentResources,
  ): EditorViewportState;
  resolveSelectionHit(
    state: EditorState,
    viewport: EditorViewportState,
    point: EditorPoint,
  ): SelectionHit | null;
  resolveDragFocus(
    state: EditorState,
    viewport: EditorViewportState,
    point: EditorPoint,
    anchor: EditorSelectionPoint,
  ): SelectionHit | null;
  resolveWordSelection(
    state: EditorState,
    viewport: EditorViewportState,
    point: EditorPoint,
  ): EditorSelection | null;
  resolveHoverTarget(
    state: EditorState,
    viewport: EditorViewportState,
    point: EditorPoint,
    liveCommentRanges: EditorCommentState["liveRanges"],
  ): EditorHoverTarget | null;
  resolveTargetAtSelection(
    state: EditorState,
    viewport: EditorViewportState,
    selectionPoint: EditorSelectionPoint,
    liveCommentRanges: EditorCommentState["liveRanges"],
  ): EditorHoverTarget | null;
  measureCaretTarget(
    state: EditorState,
    viewport: EditorViewportState,
    point: EditorSelectionPoint,
  ): CaretTarget | null;
  measureVisualCaretTarget(
    state: EditorState,
    viewport: EditorViewportState,
    point: EditorSelectionPoint,
  ): CaretTarget | null;

  // Rendering
  paintContent(
    state: EditorState,
    viewport: EditorViewportState,
    context: CanvasRenderingContext2D,
    options: {
      activeBlockId: string | null;
      activeRegionId: string | null;
      activeThreadIndex: number | null;
      devicePixelRatio: number;
      height: number;
      liveCommentRanges: EditorCommentState["liveRanges"];
      normalizedSelection: NormalizedEditorSelection;
      now?: number;
      resources?: DocumentResources;
      theme: EditorTheme;
      width: number;
    },
  ): void;
  paintOverlay(
    state: EditorState,
    viewport: EditorViewportState,
    context: CanvasRenderingContext2D,
    options: {
      devicePixelRatio: number;
      height: number;
      normalizedSelection: NormalizedEditorSelection;
      presence?: EditorPresence[];
      showCaret: boolean;
      theme: EditorTheme;
      width: number;
    },
  ): void;
};

export function createEditor(): Editor {
  return createEditorWithCache(createCanvasRenderCache());
}

// Editor instance facade: wraps standalone EditorState commands into EditorStateChange
// results and keeps browser-only effects localized here.
function createEditorWithCache(renderCache: CanvasRenderCache): Editor {
  const editor: Editor = {
    // State lifecycle
    getDocument(state) {
      return createDocumentFromEditorState(state);
    },
    createState(document) {
      return createEditorState(document);
    },

    // Queries
    getCommentState(state) {
      return getCommentState(state.documentIndex);
    },
    getPreviewState(state) {
      return getCanvasEditablePreviewState(state);
    },
    resolvePresenceCursors: resolvePresenceCursorTargets,
    resolvePresenceViewport(state, viewport, presence) {
      return resolvePresenceViewportTargets(state.documentIndex, viewport, presence);
    },
    getSelectionMarks(state) {
      const selection = normalizeSelection(state.documentIndex, state.selection);

      if (
        selection.start.regionId !== selection.end.regionId ||
        selection.start.offset === selection.end.offset
      ) {
        return [];
      }

      const region = state.documentIndex.regionIndex.get(selection.start.regionId);

      if (!region) {
        return [];
      }

      const block = findBlockById(state.documentIndex.document.blocks, region.blockId);

      if (!block) {
        return [];
      }

      const target = resolveInlineCommandTarget(block, region.path, region.semanticRegionId);

      return target
        ? resolveInlineCommandMarks(target, selection.start.offset, selection.end.offset)
        : [];
    },
    hasRunningAnimations(state, now) {
      return hasRunningEditorAnimations(state, now);
    },
    normalizeSelection(state) {
      return normalizeSelection(state.documentIndex, state.selection);
    },

    // Comments
    createCommentThread(state, selection, body) {
      const thread = createCommentThreadForSelection(state.documentIndex, selection, body);

      if (!thread) {
        return null;
      }

      return createTransitionEditorStateChange(
        state,
        spliceEditorCommentThreads(state, state.documentIndex.document.comments.length, 0, [thread]),
        true,
      );
    },
    replyToCommentThread(state, threadIndex, body) {
      return updateCommentThreadStateChange(state, threadIndex, (thread) =>
        replyToCommentThread(thread, {
          body: body.trim(),
        }),
      );
    },
    editComment(state, threadIndex, commentIndex, body) {
      return updateCommentThreadStateChange(state, threadIndex, (thread) =>
        editCommentInThread(thread, commentIndex, body),
      );
    },
    deleteComment(state, threadIndex, commentIndex) {
      return updateCommentThreadStateChange(state, threadIndex, (thread) =>
        deleteCommentFromThread(thread, commentIndex),
      );
    },
    deleteCommentThread(state, threadIndex) {
      return updateCommentThreadStateChange(state, threadIndex, () => null);
    },
    markCommentThreadAsResolved(state, threadIndex, resolved) {
      return updateCommentThreadStateChange(state, threadIndex, (thread) =>
        markCommentThreadAsResolved(thread, resolved),
      );
    },

    // Text editing
    insertText: createNullableDocumentChangeHandler(insertText),
    insertLineBreak: createNullableDocumentChangeHandler(insertLineBreak),
    deleteBackward: createNullableDocumentChangeHandler(deleteBackward),
    deleteForward: createNullableDocumentChangeHandler(deleteForward),
    deleteSelection: createDocumentChangeHandler(deleteSelectionText),
    replaceSelection: createDocumentChangeHandler(insertSelectionText),

    // Formatting
    toggleBold: createNullableDocumentChangeHandler(toggleBold),
    toggleItalic: createNullableDocumentChangeHandler(toggleItalic),
    toggleStrikethrough: createNullableDocumentChangeHandler(toggleStrikethrough),
    toggleUnderline: createNullableDocumentChangeHandler(toggleUnderline),
    toggleInlineCode: createNullableDocumentChangeHandler(toggleInlineCode),

    // Structure
    indent: createNullableDocumentChangeHandler(indent),
    dedent: createNullableDocumentChangeHandler(dedent),
    moveListItemUp: createNullableDocumentChangeHandler(moveListItemUp),
    moveListItemDown: createNullableDocumentChangeHandler(moveListItemDown),
    toggleTaskItem: createNullableDocumentChangeHandler(toggleTaskItem),
    undo: createNullableDocumentChangeHandler(undo),
    redo: createNullableDocumentChangeHandler(redo),

    // Tables
    insertTable: createNullableDocumentChangeHandler(insertTable),
    insertTableColumn: createNullableDocumentChangeHandler(insertTableColumn),
    deleteTableColumn: createNullableDocumentChangeHandler(deleteTableColumn),
    insertTableRow: createNullableDocumentChangeHandler(insertTableRow),
    deleteTableRow: createNullableDocumentChangeHandler(deleteTableRow),
    deleteTable: createNullableDocumentChangeHandler(deleteTable),

    // Links
    updateLink: createNullableDocumentChangeHandler(updateInlineLink),
    removeLink: createNullableDocumentChangeHandler(removeInlineLink),

    // Selection and navigation
    setSelection(state, selection) {
      return createTransitionEditorStateChange(state, setSelection(state, selection), false);
    },
    moveCaretHorizontally(state, direction, extendSelection = false) {
      return createTransitionEditorStateChange(
        state,
        extendSelection
          ? extendSelectionHorizontally(state, direction)
          : moveCaretHorizontallySelection(state, direction),
        false,
      );
    },
    moveCaretVertically(state, layout, direction) {
      return createTransitionEditorStateChange(
        state,
        moveCaretVerticallySelection(state, layout, direction),
        false,
      );
    },
    moveCaretByViewport(state, layout, direction) {
      return createTransitionEditorStateChange(
        state,
        moveCaretByViewportSelection(state, layout, direction),
        false,
      );
    },
    moveCaretToLineBoundary(state, layout, boundary, extendSelection = false) {
      return createTransitionEditorStateChange(
        state,
        extendSelection
          ? extendSelectionToLineBoundary(state, layout, boundary)
          : moveCaretToLineBoundarySelection(state, layout, boundary),
        false,
      );
    },

    // Layout and hit-testing
    prepareViewport(state, options, resources = emptyDocumentResources) {
      const viewport: CanvasViewport = {
        height: options.height,
        overscan: Math.max(160, options.height),
        top: options.top,
      };
      const viewportLayout = createDocumentViewport(
        state.documentIndex,
        options,
        viewport,
        [state.selection.anchor.regionId, state.selection.focus.regionId],
        renderCache,
        resources,
      );

      return {
        blockMap: createBlockMap(state.documentIndex.document.blocks),
        estimateRegionBounds: viewportLayout.estimateRegionBounds,
        regionBounds: createContainerBounds(viewportLayout.layout),
        layout: viewportLayout.layout,
        paintHeight: Math.max(240, viewport.height + viewport.overscan * 2),
        paintTop: Math.max(0, viewport.top - viewport.overscan),
        totalHeight: viewportLayout.totalHeight,
        viewport: {
          height: viewport.height,
          top: viewport.top,
        },
      };
    },
    resolveSelectionHit(state, viewport, point) {
      return (
        resolveEditorHitAtPoint(viewport.layout, state, point) ??
        resolveHitBelowLayout(viewport.layout, state, point)
      );
    },
    resolveDragFocus(state, viewport, point, anchor) {
      return resolvePointerDragFocusPointAtLocation(viewport.layout, state, point, anchor);
    },
    resolveWordSelection(state, viewport, point) {
      return resolveWordSelectionAtPoint(viewport.layout, state, point);
    },
    resolveHoverTarget(state, viewport, point, liveCommentRanges) {
      return resolveHoverTargetAtPoint(viewport.layout, state, point, liveCommentRanges);
    },
    resolveTargetAtSelection(state, viewport, selectionPoint, liveCommentRanges) {
      return resolveTargetAtSelectionPoint(
        viewport.layout,
        state,
        selectionPoint,
        liveCommentRanges,
      );
    },
    measureCaretTarget(state, viewport, point) {
      return measureCaretTarget(viewport.layout, state.documentIndex, point);
    },
    measureVisualCaretTarget(state, viewport, point) {
      const caret = measureCaretTarget(viewport.layout, state.documentIndex, point);

      if (!caret) {
        return null;
      }

      return {
        ...caret,
        left: resolveCaretVisualLeft(state, viewport.layout, caret),
      };
    },
    // Rendering
    paintContent(state, viewport, context, options) {
      paintCanvasEditorSurface({
        activeBlockId: options.activeBlockId,
        activeRegionId: options.activeRegionId,
        activeThreadIndex: options.activeThreadIndex,
        containerLineBounds: viewport.regionBounds,
        context,
        devicePixelRatio: options.devicePixelRatio,
        editorState: state,
        height: options.height,
        layout: viewport.layout,
        liveCommentRanges: options.liveCommentRanges,
        normalizedSelection: options.normalizedSelection,
        now: options.now,
        resources: options.resources ?? emptyDocumentResources,
        runtimeBlockMap: viewport.blockMap,
        theme: options.theme,
        viewportTop: viewport.paintTop,
        width: options.width,
      });
    },
    paintOverlay(state, viewport, context, options) {
      paintCanvasCaretOverlay({
        context,
        devicePixelRatio: options.devicePixelRatio,
        editorState: state,
        height: options.height,
        layout: viewport.layout,
        normalizedSelection: options.normalizedSelection,
        presence: options.presence,
        showCaret: options.showCaret,
        theme: options.theme,
        viewportTop: viewport.paintTop,
        width: options.width,
      });
    },
  };

  return editor;
}

function createBlockMap(blocks: Block[]) {
  const entries = new Map<string, Block>();

  const visit = (candidateBlocks: Block[]) => {
    for (const block of candidateBlocks) {
      entries.set(block.id, block);

      if (block.type === "blockquote" || block.type === "listItem") {
        visit(block.children);
      } else if (block.type === "list") {
        visit(block.items);
      }
    }
  };

  visit(blocks);

  return entries;
}

function createContainerBounds(layout: ViewportLayout) {
  return new Map(layout.regionBounds);
}

function createEditorStateChange(
  state: EditorState,
  documentChanged: boolean,
  animationStarted = false,
): EditorStateChange {
  return {
    animationStarted,
    documentChanged,
    state,
  };
}

function createTransitionEditorStateChange(
  previousState: EditorState,
  nextState: EditorState,
  documentChanged: boolean,
) {
  return createEditorStateChange(
    nextState,
    documentChanged,
    startedNewAnimation(previousState, nextState),
  );
}

function createNullableTransitionEditorStateChange(
  previousState: EditorState,
  nextState: EditorState | null,
  documentChanged: boolean,
) {
  if (!nextState) {
    return null;
  }

  return createTransitionEditorStateChange(previousState, nextState, documentChanged);
}

function startedNewAnimation(previousState: EditorState, nextState: EditorState) {
  const previousLatestStart = Math.max(
    -Infinity,
    ...previousState.animations.map((animation) => animation.startedAt),
  );

  return nextState.animations.some((animation) => animation.startedAt > previousLatestStart);
}

function updateCommentThreadStateChange(
  state: EditorState,
  threadIndex: number,
  updater: (thread: CommentThread) => CommentThread | null,
) {
  const threads = getCommentState(state.documentIndex).threads;
  const currentThread = threads[threadIndex];

  if (!currentThread) {
    return null;
  }

  const nextThread = updater(currentThread);

  if (nextThread === currentThread) {
    return null;
  }

  return createTransitionEditorStateChange(
    state,
    spliceEditorCommentThreads(state, threadIndex, 1, nextThread ? [nextThread] : []),
    true,
  );
}

// EditorState -> EditorStateChange adapters for the host-facing Editor instance.
function createDocumentChangeHandler<Args extends unknown[]>(
  command: (state: EditorState, ...args: Args) => EditorState,
) {
  return (state: EditorState, ...args: Args) =>
    createTransitionEditorStateChange(state, command(state, ...args), true);
}

function createNullableDocumentChangeHandler<Args extends unknown[]>(
  command: (state: EditorState, ...args: Args) => EditorState | null,
) {
  return (state: EditorState, ...args: Args) =>
    createNullableTransitionEditorStateChange(state, command(state, ...args), true);
}
