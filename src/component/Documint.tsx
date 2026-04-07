/**
 * Public React host for the canvas editor. The component owns content-format
 * bridging, DOM lifecycle, viewport coordination, and hidden-input plumbing.
 */
import {
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { countResolvedCommentThreads, isResolvedCommentThread } from "@/comments";
import type { Document } from "@/document";
import {
  type EditorTheme,
  type Presence,
  type EditorStateChange,
  type EditorSelectionPoint as SelectionPoint,
} from "@/editor";
import { PresenceOverlay } from "./overlays/PresenceOverlay";
import { parseMarkdown, serializeMarkdown } from "@/markdown";
import { AnnotationLeaf } from "./leaves/AnnotationLeaf";
import { InsertionLeaf } from "./leaves/InsertionLeaf";
import { LeafPortal, type LeafPortalAnchor } from "./leaves/LeafPortal";
import { LinkLeaf } from "./leaves/LinkLeaf";
import { TableLeaf } from "./leaves/TableLeaf";
import { useCursor } from "./hooks/useCursor";
import { useDocumentImages } from "./hooks/useDocumentImages";
import { useEditor } from "./hooks/useEditor";
import { useHover } from "./hooks/useHover";
import { useInput } from "./hooks/useInput";
import { usePresence } from "./hooks/usePresence";
import { useRenderScheduler } from "./hooks/useRenderScheduler";
import { useSelection } from "./hooks/useSelection";
import { useTheme } from "./hooks/useTheme";
import { useViewport } from "./hooks/useViewport";
import { areStatesEqual, prepareCanvasLayer } from "./lib/canvas";
import { type EditorKeybinding } from "./lib/keybindings";
import { autoScrollSelectionContainer, normalizeSelectionAbsolutePositions } from "./lib/selection";
import { reconcileExternalContentChange } from "./lib/reconciliation";
import { DocumintSsr } from "./Ssr";
import { DOCUMINT_EDITOR_STYLES } from "./styles";

export type DocumintState = {
  activeBlockType: string | null;
  activeCommentThreadIndex: number | null;
  activeSpanKind: string | null;
  canonicalContent: string;
  characterCount: number;
  commentThreadCount: number;
  docChangeCount: number;
  lastTransactionMs: number;
  layoutWidth: number;
  lineCount: number;
  resolvedCommentCount: number;
  selectionFrom: number;
  selectionTo: number;
  transactionCount: number;
};

export type DocumintTheme = EditorTheme | { dark: EditorTheme; light: EditorTheme };

export type DocumintProps = {
  className?: string;
  content: string;
  keybindings?: EditorKeybinding[];
  onContentChange?: (content: string, document: Document) => void;
  onStateChange?: (state: DocumintState) => void;
  presence?: Presence[];
  theme?: DocumintTheme;
};

type PerfMetrics = {
  docChangeCount: number;
  lastTransactionMs: number;
  transactionCount: number;
};

type FocusVisibilityRequest = {
  layoutWidth: number;
  offset: number;
  regionId: string;
  scrollContentHeight: number;
  viewportHeight: number;
};

const defaultPerfMetrics: PerfMetrics = {
  docChangeCount: 0,
  lastTransactionMs: 0,
  transactionCount: 0,
};
const selectionLeafVerticalOffset = 2;

const defaultDocumintState: DocumintState = {
  activeBlockType: null,
  activeCommentThreadIndex: null,
  activeSpanKind: null,
  canonicalContent: "",
  characterCount: 0,
  commentThreadCount: 0,
  docChangeCount: 0,
  lastTransactionMs: 0,
  layoutWidth: 0,
  lineCount: 0,
  resolvedCommentCount: 0,
  selectionFrom: 0,
  selectionTo: 0,
  transactionCount: 0,
};

export function Documint({
  className,
  content,
  keybindings,
  onContentChange,
  onStateChange,
  presence,
  theme,
}: DocumintProps) {
  const editor = useEditor();
  const hostRef = useRef<HTMLElement | null>(null);
  const contentCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const editorStateRef = useRef<ReturnType<typeof editor.createState> | null>(null);
  const perfMetricsRef = useRef<PerfMetrics>(defaultPerfMetrics);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragAnchorRef = useRef<SelectionPoint | null>(null);
  const pendingTaskToggleRef = useRef<string | null>(null);
  const handledTaskToggleClickRef = useRef(false);
  const lastEmittedContentRef = useRef(content);
  const canonicalContentRef = useRef("");
  const componentStateRef = useRef(defaultDocumintState);
  const lastFocusVisibilityRequestRef = useRef<FocusVisibilityRequest | null>(null);
  const [hasMountedCanvases, setHasMountedCanvases] = useState(false);
  const { theme: preferredTheme, themeStyles } = useTheme(theme);
  const [componentState, setComponentState] = useState(defaultDocumintState);
  const contentDocument = useMemo(() => parseMarkdown(content), [content]);
  const canonicalContent = useMemo(() => serializeMarkdown(contentDocument), [contentDocument]);
  const [editorState, setEditorState] = useState(() => editor.createState(contentDocument));
  const renderResources = useDocumentImages(editorState.documentIndex.document);
  const hasLoadingImages = useMemo(
    () => [...renderResources.images.values()].some((image) => image.status === "loading"),
    [renderResources],
  );

  editorStateRef.current = editorState;
  canonicalContentRef.current ||= canonicalContent;

  const viewport = useViewport({
    editor,
    editorState,
    editorStateRef,
    renderResources,
    theme: preferredTheme,
  });
  const {
    actions: viewportActions,
    props: viewportProps,
    refs: viewportRefs,
    state: viewportState,
  } = viewport;
  const {
    getScrollTop,
    observePreparedViewport,
    observeScrollContainer,
    resolvePointerPoint,
    scrollTo,
  } = viewportActions;
  const {
    layoutWidth,
    preparedViewport,
    scrollContentHeight,
    surfaceWidth,
    viewportHeight,
    viewportTop,
  } = viewportState;
  const { scrollContainer: scrollContainerRef } = viewportRefs;
  const selectionContext = useMemo(
    () => editor.getSelectionContext(editorState),
    [editor, editorState],
  );
  const commentState = useMemo(() => editor.getCommentState(editorState), [editor, editorState]);
  const normalizedSelection = useMemo(
    () => editor.normalizeSelection(editorState),
    [editor, editorState],
  );
  const activeCommentThreadIndex = useMemo(
    () => resolveActiveCommentThreadIndex(editorState, commentState.liveRanges),
    [commentState.liveRanges, editorState],
  );
  const canEditComments = Boolean(onContentChange);
  const readCurrentState = () => editorStateRef.current ?? editorState;

  const publishState = useEffectEvent((state: typeof editorState, canonicalContent: string) => {
    const nextSelectionContext = editor.getSelectionContext(state);
    const nextCommentState = editor.getCommentState(state);
    const nextAbsoluteSelection = normalizeSelectionAbsolutePositions(state);
    const nextState: DocumintState = {
      activeBlockType: nextSelectionContext.block?.nodeType ?? null,
      activeCommentThreadIndex: resolveActiveCommentThreadIndex(state, nextCommentState.liveRanges),
      activeSpanKind:
        nextSelectionContext.span.kind === "none" ? null : nextSelectionContext.span.kind,
      canonicalContent,
      characterCount: canonicalContent.length,
      commentThreadCount: nextCommentState.threads.length,
      docChangeCount: perfMetricsRef.current.docChangeCount,
      lastTransactionMs: perfMetricsRef.current.lastTransactionMs,
      layoutWidth,
      lineCount: countLines(canonicalContent),
      resolvedCommentCount: countResolvedCommentThreads(nextCommentState.threads),
      selectionFrom: nextAbsoluteSelection.start,
      selectionTo: nextAbsoluteSelection.end,
      transactionCount: perfMetricsRef.current.transactionCount,
    };

    setComponentState((previous) => (areStatesEqual(previous, nextState) ? previous : nextState));

    if (!areStatesEqual(componentStateRef.current, nextState)) {
      componentStateRef.current = nextState;
      onStateChange?.(nextState);
    }
  });

  const applyEditorStateChange = useEffectEvent((stateChange: EditorStateChange | null) => {
    if (!stateChange) {
      return;
    }

    const startedAt = performance.now();
    editorStateRef.current = stateChange.state;
    setEditorState(stateChange.state);
    perfMetricsRef.current = {
      docChangeCount: perfMetricsRef.current.docChangeCount + (stateChange.documentChanged ? 1 : 0),
      lastTransactionMs: performance.now() - startedAt,
      transactionCount: perfMetricsRef.current.transactionCount + 1,
    };

    const cachedViewportState = preparedViewport.current;
    const canReuseEditorViewportState =
      !stateChange.documentChanged ||
      !cachedViewportState ||
      cachedViewportState.layout.regionLineIndices.has(stateChange.state.selection.focus.regionId);

    if (!canReuseEditorViewportState) {
      preparedViewport.invalidate();
    }

    if (stateChange.animationStarted) {
      scheduleRender("viewport");
    }

    if (!stateChange.documentChanged) {
      return;
    }

    const nextDocument = editor.getDocument(stateChange.state);
    const nextContent = serializeMarkdown(nextDocument);

    canonicalContentRef.current = nextContent;
    lastEmittedContentRef.current = nextContent;
    onContentChange?.(nextContent, nextDocument);
  });

  const renderContent = useEffectEvent((viewportState = preparedViewport.current) => {
    if (!viewportState) {
      return;
    }

    const preparedLayer = prepareCanvasLayer(contentCanvasRef.current, {
      paintHeight: viewportState.paintHeight,
      paintTop: viewportState.paintTop,
      width: layoutWidth,
    });

    if (!preparedLayer) {
      return;
    }

    const { context, devicePixelRatio, height, width } = preparedLayer;

    editor.paintContent(editorState, viewportState, context, {
      activeBlockId: selectionContext.block?.blockId ?? null,
      activeRegionId: editorState.selection.focus.regionId,
      activeThreadIndex: hoveredCommentThreadIndex ?? activeCommentThreadIndex,
      devicePixelRatio,
      height,
      liveCommentRanges: commentState.liveRanges,
      normalizedSelection,
      now: performance.now(),
      resources: renderResources,
      theme: preferredTheme,
      width,
    });
  });

  const renderOverlay = useEffectEvent((viewportState = preparedViewport.current) => {
    if (!viewportState) {
      return;
    }

    const preparedLayer = prepareCanvasLayer(overlayCanvasRef.current, {
      paintHeight: viewportState.paintHeight,
      paintTop: viewportState.paintTop,
      width: layoutWidth,
    });

    if (!preparedLayer) {
      return;
    }

    const { context, devicePixelRatio, height, width } = preparedLayer;

    editor.paintOverlay(editorState, viewportState, context, {
      devicePixelRatio,
      height,
      normalizedSelection,
      presence: presenceController.canvasPresence,
      showCaret:
        normalizedSelection.start.regionId !== normalizedSelection.end.regionId ||
        normalizedSelection.start.offset !== normalizedSelection.end.offset ||
        cursor.isVisible(),
      theme: preferredTheme,
      width,
    });
  });

  const renderViewport = useEffectEvent(() => {
    preparedViewport.invalidate();
    const viewportState = preparedViewport.get();

    observePreparedViewport(viewportState);
    presenceController.refreshViewportPresence(viewportState);
    renderContent(viewportState);
    renderOverlay(viewportState);
  });

  const { scheduleRender } = useRenderScheduler({
    hasRunningAnimations: () =>
      editor.hasRunningAnimations(editorStateRef.current ?? editorState, performance.now()),
    renderContent,
    renderOverlay,
    renderViewport,
  });

  const scrollContainerProps = viewportProps.getScrollContainer({
    onScroll: () => scheduleRender("viewport"),
  });

  const cursor = useCursor({
    canShowInsertionLeaf: Boolean(onContentChange),
    canShowTableLeaf: Boolean(onContentChange),
    commentState,
    editor,
    editorState,
    editorViewportState: preparedViewport,
    onVisibilityChange: () => scheduleRender("overlay"),
  });
  const hover = useHover({
    commentState,
    editor,
    editorStateRef,
    editorViewportState: preparedViewport,
    resolveDocumentPoint: resolvePointerPoint,
  });
  const hoveredCommentThreadIndex = hover.leaf?.kind === "comment" ? hover.leaf.threadIndex : null;

  const handleViewportScroll = useEffectEvent((scrollContainer: HTMLDivElement) => {
    observeScrollContainer(scrollContainer);
    scheduleRender("viewport");
  });
  const presenceController = usePresence({
    editor,
    editorState,
    editorStateRef,
    editorViewportState: preparedViewport,
    onViewportScroll: handleViewportScroll,
    presence,
    scrollContainerRef,
    scheduleOverlayRender: () => scheduleRender("overlay"),
  });

  const handleViewportWheel = useEffectEvent(
    (scrollContainer: HTMLDivElement, event: WheelEvent) => {
      if (scrollContainer.scrollHeight <= scrollContainer.clientHeight || event.deltaY === 0) {
        return;
      }

      const lineHeight = 24;
      const deltaMultiplier =
        event.deltaMode === 1
          ? lineHeight
          : event.deltaMode === 2
            ? scrollContainer.clientHeight
            : 1;
      const nextTop = Math.max(
        0,
        Math.min(
          scrollContainer.scrollHeight - scrollContainer.clientHeight,
          scrollContainer.scrollTop + event.deltaY * deltaMultiplier,
        ),
      );

      if (nextTop === scrollContainer.scrollTop) {
        return;
      }

      event.preventDefault();
      scrollTo(nextTop);
      scheduleRender("viewport");
    },
  );

  const input = useInput({
    editor,
    editorState,
    editorStateRef,
    editorViewportState: preparedViewport,
    inputRef,
    keybindings,
    onActivity: cursor.markActivity,
    onEditorStateChange: applyEditorStateChange,
  });
  const selection = useSelection({
    autoScrollContainer: (event) => {
      autoScrollSelectionContainer(scrollContainerRef.current, event);
    },
    canShowSelectionLeaf: canEditComments,
    canvasRef: contentCanvasRef,
    threads: commentState.threads,
    editor,
    editorState,
    editorStateRef,
    scrollContainerRef,
    editorViewportState: preparedViewport,
    onActivity: cursor.markActivity,
    onEditorStateChange: applyEditorStateChange,
  });
  const focusCanvas = useEffectEvent(() => {
    contentCanvasRef.current?.focus({
      preventScroll: true,
    });
  });
  const releaseCanvasPointer = useEffectEvent((pointerId: number) => {
    const canvas = contentCanvasRef.current;

    if (canvas && dragPointerIdRef.current === pointerId) {
      canvas.releasePointerCapture(pointerId);
    }
  });
  const clearCanvasDrag = useEffectEvent(() => {
    dragPointerIdRef.current = null;
    dragAnchorRef.current = null;
  });
  const handleCanvasPointerCancel = useEffectEvent((event: PointerEvent<HTMLCanvasElement>) => {
    releaseCanvasPointer(event.pointerId);
    clearCanvasDrag();
    pendingTaskToggleRef.current = null;
    handledTaskToggleClickRef.current = false;
  });
  const handleCanvasPointerDown = useEffectEvent((event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = contentCanvasRef.current;
    const currentState = readCurrentState();
    const point = resolvePointerPoint(event);

    if (!point) {
      return;
    }

    const target = hover.resolveTarget(event);

    if (target?.kind === "task-toggle") {
      event.preventDefault();
      event.stopPropagation();
      pendingTaskToggleRef.current = target.listItemId;
      cursor.markActivity();
      focusCanvas();
      return;
    }

    const hit = editor.resolveSelectionHit(currentState, preparedViewport.get(), point);

    if (!canvas || !hit) {
      return;
    }

    dragPointerIdRef.current = event.pointerId;
    dragAnchorRef.current = {
      offset: hit.offset,
      regionId: hit.regionId,
    };
    cursor.markActivity();
    canvas.setPointerCapture(event.pointerId);
    applyEditorStateChange(
      editor.setSelection(currentState, {
        offset: hit.offset,
        regionId: hit.regionId,
      }),
    );
    // Pass the tapped caret to `focus` so it positions the hidden textarea
    // synchronously before invoking the native `focus()`. Without this, the
    // textarea's position only updates on the next React render via the
    // layout effect — which is too late for iOS's scroll-to-focused-input
    // decision, leaving the caret hidden behind the virtual keyboard.
    input.focus({ offset: hit.offset, regionId: hit.regionId });
  });
  const handleCanvasPointerLeave = useEffectEvent(() => {
    hover.canvasHandlers.onPointerLeave();
    handledTaskToggleClickRef.current = false;
  });
  const handleCanvasPointerMove = useEffectEvent((event: PointerEvent<HTMLCanvasElement>) => {
    const anchor = dragAnchorRef.current;
    const currentState = readCurrentState();
    const point = resolvePointerPoint(event);

    if (!point) {
      return;
    }

    hover.canvasHandlers.onPointerMove(event);

    if (dragPointerIdRef.current !== event.pointerId || !anchor) {
      return;
    }

    const nextFocus = editor.resolveDragFocus(currentState, preparedViewport.get(), point, anchor);

    if (!nextFocus) {
      return;
    }

    cursor.markActivity();
    autoScrollSelectionContainer(scrollContainerRef.current, event);
    applyEditorStateChange(
      editor.setSelection(currentState, {
        anchor,
        focus: nextFocus,
      }),
    );
  });
  const handleCanvasPointerUp = useEffectEvent((event: PointerEvent<HTMLCanvasElement>) => {
    const currentState = readCurrentState();

    releaseCanvasPointer(event.pointerId);

    if (pendingTaskToggleRef.current) {
      const toggled = editor.toggleTaskItem(currentState, pendingTaskToggleRef.current);

      pendingTaskToggleRef.current = null;

      if (toggled) {
        handledTaskToggleClickRef.current = true;
        event.preventDefault();
        event.stopPropagation();
        cursor.markActivity();
        applyEditorStateChange(toggled);
      }
    }

    clearCanvasDrag();
  });
  const handleCanvasClick = useEffectEvent((event: MouseEvent<HTMLCanvasElement>) => {
    if (handledTaskToggleClickRef.current) {
      handledTaskToggleClickRef.current = false;
      pendingTaskToggleRef.current = null;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (hover.canvasHandlers.onClick(event)) {
      return;
    }

    pendingTaskToggleRef.current = null;
    input.focus();
  });
  const handleCanvasDoubleClick = useEffectEvent((event: MouseEvent<HTMLCanvasElement>) => {
    const currentState = readCurrentState();
    const point = resolvePointerPoint(event);
    const target = hover.resolveTarget(event);

    if (!point || target?.kind === "task-toggle") {
      return;
    }

    const selection = editor.resolveWordSelection(currentState, preparedViewport.get(), point);

    if (!selection) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    cursor.markActivity();
    applyEditorStateChange(editor.setSelection(currentState, selection));
    input.focus();
  });

  useEffect(() => {
    setHasMountedCanvases(true);
  }, []);

  useLayoutEffect(() => {
    if (content === lastEmittedContentRef.current) {
      return;
    }

    const previousState = editorStateRef.current;
    const reconciliation = reconcileExternalContentChange(
      previousState,
      editor.createState(contentDocument),
    );
    const nextState = reconciliation.state;
    const nextViewportTop = reconciliation.didReconcile ? getScrollTop() : 0;

    editorStateRef.current = nextState;
    setEditorState(nextState);
    lastEmittedContentRef.current = content;
    canonicalContentRef.current = canonicalContent;
    // The prepared viewport is tied to the previous editor state. Clear it so
    // pre-paint overlay effects measure against the reconciled model instead of
    // briefly hiding handles/leaves when old geometry cannot resolve the new
    // selection. Longer term, the viewport cache should carry enough input
    // metadata to validate itself before reuse.
    scrollTo(nextViewportTop);
  }, [canonicalContent, content, contentDocument, editor, getScrollTop, scrollTo]);

  useEffect(() => {
    publishState(editorState, canonicalContentRef.current || canonicalContent);
  }, [canonicalContent, editorState, publishState, surfaceWidth]);

  // Keep the active selection focus visible when navigation or host resizing
  // moves it out of view, without reacting to unrelated document edits that
  // preserve the current focus.
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const focus = editorState.selection.focus;

    if (!scrollContainer) {
      return;
    }

    const focusVisibilityRequest = {
      layoutWidth,
      offset: focus.offset,
      regionId: focus.regionId,
      scrollContentHeight,
      viewportHeight,
    };

    if (
      areFocusVisibilityRequestsEqual(lastFocusVisibilityRequestRef.current, focusVisibilityRequest)
    ) {
      return;
    }

    const padding = 24;
    const caret = editor.measureCaretTarget(editorState, preparedViewport.get(), focus);

    if (!caret) {
      return;
    }

    const visibleHeight = viewportHeight;
    const currentTop = scrollContainer.scrollTop;
    const visibleTop = currentTop + padding;
    const visibleBottom = currentTop + visibleHeight - padding;

    if (caret.top < visibleTop) {
      const appliedTop = scrollTo(Math.max(0, caret.top - padding));

      if (isCaretVisibleAtScrollTop(caret, appliedTop, visibleHeight, padding)) {
        lastFocusVisibilityRequestRef.current = focusVisibilityRequest;
      }

      return;
    }

    if (caret.top + caret.height > visibleBottom) {
      const appliedTop = scrollTo(Math.max(0, caret.top + caret.height - visibleHeight + padding));

      if (isCaretVisibleAtScrollTop(caret, appliedTop, visibleHeight, padding)) {
        lastFocusVisibilityRequestRef.current = focusVisibilityRequest;
      }

      return;
    }

    lastFocusVisibilityRequestRef.current = focusVisibilityRequest;
  }, [
    editor,
    editorState,
    editorState.selection.focus.offset,
    editorState.selection.focus.regionId,
    preparedViewport,
    layoutWidth,
    scrollContentHeight,
    scrollTo,
    viewportHeight,
  ]);

  useEffect(() => {
    scheduleRender("viewport");
  }, [
    commentState.liveRanges,
    editorState,
    layoutWidth,
    normalizedSelection.end.regionId,
    normalizedSelection.end.offset,
    normalizedSelection.start.regionId,
    normalizedSelection.start.offset,
    selectionContext.block?.blockId,
    preferredTheme,
    renderResources,
    activeCommentThreadIndex,
    scheduleRender,
    viewportHeight,
  ]);

  useEffect(() => {
    if (!hasLoadingImages) {
      return;
    }

    let frameId: number | null = null;
    const windowObject = window;

    const paintLoadingFrame = () => {
      scheduleRender("viewport");
      frameId = windowObject.requestAnimationFrame(paintLoadingFrame);
    };

    frameId = windowObject.requestAnimationFrame(paintLoadingFrame);

    return () => {
      if (frameId !== null) {
        windowObject.cancelAnimationFrame(frameId);
      }
    };
  }, [hasLoadingImages, scheduleRender]);

  // Hovered comment thread changes only restyle content-layer comment highlights,
  // so they can reuse the prepared viewport and let the scheduler coalesce with
  // any concurrent viewport render.
  useEffect(() => {
    scheduleRender("content");
  }, [hoveredCommentThreadIndex, scheduleRender]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;

    if (!scrollContainer) {
      return;
    }

    const nativeHandleWheel = (event: WheelEvent) => {
      handleViewportWheel(scrollContainer, event);
    };

    scrollContainer.addEventListener("wheel", nativeHandleWheel, {
      passive: false,
    });

    return () => {
      scrollContainer.removeEventListener("wheel", nativeHandleWheel);
    };
  }, [handleViewportWheel]);

  const sectionClassName = className ? `documint ${className}` : "documint";
  const resolveVisibleLeafPresentation = () => {
    const hoveredLeaf = hover.leaf;
    const visibleLeaf = hoveredLeaf ?? selection.leaf ?? cursor.leaf;
    const isSelectionLeafVisible = !hoveredLeaf && Boolean(selection.leaf);
    const scrollContainerBounds = scrollContainerRef.current?.getBoundingClientRect() ?? null;
    const visibleThreadLeaf =
      visibleLeaf?.kind === "thread"
        ? {
            ...visibleLeaf,
            thread: commentState.threads[visibleLeaf.threadIndex] ?? null,
          }
        : null;
    const annotationThreadLeaf =
      visibleLeaf?.kind === "comment"
        ? {
            animateInitialComment: false,
            link: visibleLeaf.link,
            thread: visibleLeaf.thread,
            threadIndex: visibleLeaf.threadIndex,
          }
        : visibleThreadLeaf?.thread
          ? {
              animateInitialComment: visibleThreadLeaf.animateInitialComment ?? false,
              link: null,
              thread: visibleThreadLeaf.thread,
              threadIndex: visibleThreadLeaf.threadIndex,
            }
          : null;
    const visibleLeafStatus: "default" | "resolved" =
      annotationThreadLeaf?.thread && isResolvedCommentThread(annotationThreadLeaf.thread)
        ? "resolved"
        : "default";

    return {
      annotationThreadLeaf,
      visibleLeaf,
      visibleLeafAnchor: visibleLeaf
        ? ({
            container: hostRef.current,
            isSelection: isSelectionLeafVisible,
            left: (scrollContainerBounds?.left ?? 0) + visibleLeaf.left,
            onPointerEnter: hoveredLeaf ? hover.leafHandlers.onPointerEnter : undefined,
            onPointerLeave: hoveredLeaf ? hover.leafHandlers.onPointerLeave : undefined,
            top:
              (scrollContainerBounds?.top ?? 0) +
              visibleLeaf.top -
              viewportTop +
              (isSelectionLeafVisible ? selectionLeafVerticalOffset : 0),
          } satisfies LeafPortalAnchor)
        : undefined,
      visibleLeafClassName: visibleLeaf?.kind === "link" ? "documint-link-leaf" : undefined,
      visibleLeafStatus,
    };
  };
  const {
    annotationThreadLeaf,
    visibleLeaf,
    visibleLeafAnchor,
    visibleLeafClassName,
    visibleLeafStatus,
  } = resolveVisibleLeafPresentation();
  const resolveVisibleLeafContent = () => {
    if (!visibleLeaf) {
      return null;
    }

    switch (visibleLeaf.kind) {
      case "insertion":
        return (
          <InsertionLeaf
            onInsert={(text) => {
              applyEditorStateChange(editor.insertText(readCurrentState(), text));
            }}
            onInsertTable={(columnCount) => {
              applyEditorStateChange(editor.insertTable(readCurrentState(), columnCount));
            }}
          />
        );
      case "table":
        return (
          <TableLeaf
            canDeleteColumn={visibleLeaf.columnCount > 1}
            canDeleteRow={visibleLeaf.rowCount > 1}
            onDeleteColumn={() => {
              applyEditorStateChange(editor.deleteTableColumn(readCurrentState()));
            }}
            onDeleteRow={() => {
              applyEditorStateChange(editor.deleteTableRow(readCurrentState()));
            }}
            onDeleteTable={() => {
              applyEditorStateChange(editor.deleteTable(readCurrentState()));
            }}
            onInsertColumn={(direction) => {
              applyEditorStateChange(editor.insertTableColumn(readCurrentState(), direction));
            }}
            onInsertRow={(direction) => {
              applyEditorStateChange(editor.insertTableRow(readCurrentState(), direction));
            }}
          />
        );
      case "link":
        return (
          <LinkLeaf
            canEdit={canEditComments}
            onDelete={() => {
              const stateUpdate = editor.removeLink(
                readCurrentState(),
                visibleLeaf.regionId,
                visibleLeaf.startOffset,
                visibleLeaf.endOffset,
              );

              if (stateUpdate) {
                applyEditorStateChange(stateUpdate);
              }
            }}
            onSave={(url) => {
              const stateUpdate = editor.updateLink(
                readCurrentState(),
                visibleLeaf.regionId,
                visibleLeaf.startOffset,
                visibleLeaf.endOffset,
                url,
              );

              if (stateUpdate) {
                applyEditorStateChange(stateUpdate);
              }
            }}
            title={visibleLeaf.title}
            url={visibleLeaf.url}
          />
        );
      case "create":
        return (
          <AnnotationLeaf
            activeMarks={visibleLeaf.activeMarks}
            canEdit={canEditComments}
            link={null}
            mode="create"
            onCreateThread={(body) => {
              const currentState = readCurrentState();
              const threadIndex = editor.getDocument(currentState).comments.length;
              const stateUpdate = editor.createCommentThread(
                currentState,
                visibleLeaf.selection,
                body.trim(),
              );

              if (!stateUpdate) {
                return;
              }

              applyEditorStateChange(stateUpdate);
              selection.promoteLeafToThread(threadIndex, true);
            }}
            onToggleBold={() => {
              applyEditorStateChange(editor.toggleBold(readCurrentState()));
            }}
            onToggleItalic={() => {
              applyEditorStateChange(editor.toggleItalic(readCurrentState()));
            }}
            onToggleStrikethrough={() => {
              applyEditorStateChange(editor.toggleStrikethrough(readCurrentState()));
            }}
            onToggleUnderline={() => {
              applyEditorStateChange(editor.toggleUnderline(readCurrentState()));
            }}
          />
        );
      default:
        return annotationThreadLeaf ? (
          <AnnotationLeaf
            animateInitialComment={annotationThreadLeaf.animateInitialComment}
            canEdit={canEditComments}
            link={annotationThreadLeaf.link}
            mode="thread"
            onDeleteComment={(commentIndex) => {
              applyEditorStateChange(
                editor.deleteComment(
                  readCurrentState(),
                  annotationThreadLeaf.threadIndex,
                  commentIndex,
                ),
              );
            }}
            onDeleteThread={() => {
              applyEditorStateChange(
                editor.deleteCommentThread(readCurrentState(), annotationThreadLeaf.threadIndex),
              );
            }}
            onEditComment={(commentIndex, body) => {
              applyEditorStateChange(
                editor.editComment(
                  readCurrentState(),
                  annotationThreadLeaf.threadIndex,
                  commentIndex,
                  body,
                ),
              );
            }}
            onReply={(body) => {
              applyEditorStateChange(
                editor.replyToCommentThread(
                  readCurrentState(),
                  annotationThreadLeaf.threadIndex,
                  body,
                ),
              );
            }}
            onToggleResolved={() => {
              applyEditorStateChange(
                editor.markCommentThreadAsResolved(
                  readCurrentState(),
                  annotationThreadLeaf.threadIndex,
                  !isResolvedCommentThread(annotationThreadLeaf.thread),
                ),
              );
            }}
            thread={annotationThreadLeaf.thread}
          />
        ) : null;
    }
  };
  const visibleLeafContent = resolveVisibleLeafContent();

  return (
    <section
      className={sectionClassName}
      data-active-block={componentState.activeBlockType ?? ""}
      data-active-comment-thread={componentState.activeCommentThreadIndex ?? ""}
      data-active-span={componentState.activeSpanKind ?? ""}
      ref={hostRef}
      style={{ ...themeStyles, height: "100%", minHeight: 0 }}
    >
      <style>{DOCUMINT_EDITOR_STYLES}</style>
      <div
        {...scrollContainerProps}
        className="documint-scroll-container"
        style={{
          height: "100%",
          minHeight: 0,
        }}
      >
        <textarea
          {...input.inputHandlers}
          ref={inputRef}
          autoCapitalize="sentences"
          className="documint-input"
          spellCheck={false}
          tabIndex={-1}
        />

        <PresenceOverlay
          insetX={preferredTheme.paddingX}
          insetY={preferredTheme.paddingY}
          {...presenceController.presenceOverlayProps}
        />

        {/* Scroll content wrapper (this forces a virtualized scroll height for the document, that is only partially rendered) */}
        <div {...viewportProps.scrollContent} className="documint-scroll-content">
          {/* Main content canvas (used for rendering the document viewport) */}
          <canvas
            {...input.canvasHandlers}
            aria-label="Documint editor"
            className="documint-content-canvas"
            style={{
              cursor: hover.cursor,
            }}
            onPointerCancel={handleCanvasPointerCancel}
            onPointerDown={handleCanvasPointerDown}
            onPointerLeave={handleCanvasPointerLeave}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onClick={handleCanvasClick}
            onDoubleClick={handleCanvasDoubleClick}
            ref={contentCanvasRef}
            tabIndex={0}
          />

          {/* Overlay canvas (urrently used for rendering the blinking cursor) */}
          <canvas aria-hidden="true" className="documint-overlay-canvas" ref={overlayCanvasRef} />

          {/* Selection handles (which we render as DOM rather than in-canvas) */}
          {selection.handles ? (
            <>
              <div
                aria-hidden="true"
                className="documint-selection-handle documint-selection-handle-start"
                style={{
                  left: `${selection.handles.start.left}px`,
                  top: `${selection.handles.start.top}px`,
                }}
                {...selection.startHandleProps}
              >
                <span className="documint-selection-handle-knob" />
              </div>
              <div
                aria-hidden="true"
                className="documint-selection-handle documint-selection-handle-end"
                style={{
                  left: `${selection.handles.end.left}px`,
                  top: `${selection.handles.end.top}px`,
                }}
                {...selection.endHandleProps}
              >
                <span className="documint-selection-handle-knob" />
              </div>
            </>
          ) : null}

          {/* Leaf menu */}
          {visibleLeaf && visibleLeafAnchor ? (
            <LeafPortal
              anchor={visibleLeafAnchor}
              className={visibleLeafClassName}
              status={visibleLeafStatus}
            >
              {visibleLeafContent}
            </LeafPortal>
          ) : null}
        </div>

        {/* SSR fallback */}
        {!hasMountedCanvases ? (
          <div className="documint-fallback">
            <DocumintSsr blocks={contentDocument.blocks} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function countLines(content: string) {
  return content.length === 0 ? 0 : content.split("\n").length;
}

function areFocusVisibilityRequestsEqual(
  previous: FocusVisibilityRequest | null,
  next: FocusVisibilityRequest,
) {
  return (
    previous?.layoutWidth === next.layoutWidth &&
    previous.regionId === next.regionId &&
    previous.offset === next.offset &&
    previous.scrollContentHeight === next.scrollContentHeight &&
    previous.viewportHeight === next.viewportHeight
  );
}

function isCaretVisibleAtScrollTop(
  caret: { height: number; top: number },
  scrollTop: number,
  visibleHeight: number,
  padding: number,
) {
  return (
    caret.top >= scrollTop + padding &&
    caret.top + caret.height <= scrollTop + visibleHeight - padding
  );
}

function resolveActiveCommentThreadIndex(
  state: {
    documentIndex: {
      regions: Array<{
        id: string;
      }>;
    };
    selection: {
      anchor: {
        offset: number;
        regionId: string;
      };
      focus: {
        offset: number;
        regionId: string;
      };
    };
  },
  liveRanges: Array<{
    endOffset: number;
    regionId: string;
    startOffset: number;
    threadIndex: number;
  }>,
) {
  const regionOrderIndex = new Map(
    state.documentIndex.regions.map((region, index) => [region.id, index]),
  );
  const anchorOrder = resolveSelectionPointOrder(
    regionOrderIndex,
    state.selection.anchor.regionId,
    state.selection.anchor.offset,
  );
  const focusOrder = resolveSelectionPointOrder(
    regionOrderIndex,
    state.selection.focus.regionId,
    state.selection.focus.offset,
  );
  const [selectionStart, selectionEnd] =
    anchorOrder <= focusOrder ? [anchorOrder, focusOrder] : [focusOrder, anchorOrder];
  const isCollapsed = anchorOrder === focusOrder;

  for (const range of liveRanges) {
    const rangeStart = resolveSelectionPointOrder(
      regionOrderIndex,
      range.regionId,
      range.startOffset,
    );
    const rangeEnd = resolveSelectionPointOrder(regionOrderIndex, range.regionId, range.endOffset);

    if (isCollapsed) {
      if (selectionStart >= rangeStart && selectionStart <= rangeEnd) {
        return range.threadIndex;
      }

      continue;
    }

    if (Math.max(selectionStart, rangeStart) < Math.min(selectionEnd, rangeEnd)) {
      return range.threadIndex;
    }
  }

  return null;
}

function resolveSelectionPointOrder(
  regionOrderIndex: Map<string, number>,
  regionId: string,
  offset: number,
) {
  return (regionOrderIndex.get(regionId) ?? -1) * 1_000_000 + offset;
}
