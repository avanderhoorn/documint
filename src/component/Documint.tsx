/**
 * Public React host for the canvas editor. The component owns content-format
 * bridging, DOM lifecycle, viewport coordination, and hidden-input plumbing.
 */
import {
  type CSSProperties,
  type ClipboardEvent,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  countResolvedCommentThreads,
  isResolvedCommentThread,
} from "@/comments";
import type { Document } from "@/document";
import {
  type PreparedViewport,
  type EditorStateChange,
  type EditorSelectionPoint as SelectionPoint,
} from "@/editor";
import { darkEditorTheme, lightEditorTheme, type EditorTheme } from "@/editor";
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
import { useNativeInput } from "./hooks/useNativeInput";
import { useRenderScheduler } from "./hooks/useRenderScheduler";
import { useSelection } from "./hooks/useSelection";
import { areStatesEqual, resolveCanvasDevicePixelRatio } from "./lib/canvas";
import {
  defaultHostMetrics,
  readContentMetrics,
  readHostMetrics,
  resolveEditorSurfaceWidth,
  type HostMetrics,
} from "./lib/metrics";
import {
  autoScrollSelectionFrame,
  normalizeSelectionAbsolutePositions,
  readSingleContainerSelectionText,
} from "./lib/selection";
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
  hostHeight: number;
  hostWidth: number;
  lastTransactionMs: number;
  layoutWidth: number;
  lineCount: number;
  resolvedCommentCount: number;
  selectionFrom: number;
  selectionTo: number;
  transactionCount: number;
};

export type DocumintProps = {
  className?: string;
  content: string;
  onContentChange?: (content: string, document: Document) => void;
  onStateChange?: (state: DocumintState) => void;
  theme?: EditorTheme;
};

type PerfMetrics = {
  docChangeCount: number;
  lastTransactionMs: number;
  transactionCount: number;
};

type ViewportMetrics = {
  height: number;
  top: number;
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
  hostHeight: 0,
  hostWidth: 0,
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
  onContentChange,
  onStateChange,
  theme,
}: DocumintProps) {
  const editor = useEditor();
  const hostRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const caretCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const editorStateRef = useRef<ReturnType<typeof editor.createState> | null>(null);
  const perfMetricsRef = useRef<PerfMetrics>(defaultPerfMetrics);
  const hostMetricsRef = useRef<HostMetrics>(defaultHostMetrics);
  const surfaceWidthRef = useRef(0);
  const resizeFrameRef = useRef<number | null>(null);
  const viewportMetricsRef = useRef<ViewportMetrics>({
    height: 240,
    top: 0,
  });
  const viewportRenderDataRef = useRef<PreparedViewport | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragAnchorRef = useRef<SelectionPoint | null>(null);
  const pendingTaskToggleRef = useRef<string | null>(null);
  const handledTaskToggleClickRef = useRef(false);
  const lastEmittedContentRef = useRef(content);
  const canonicalContentRef = useRef("");
  const lastAutoScrolledCaretRef = useRef<{
    regionId: string;
    documentEditor: ReturnType<typeof editor.createState>["documentEditor"] | null;
    hostHeight: number;
    layoutWidth: number;
    offset: number;
  } | null>(null);
  const componentStateRef = useRef(defaultDocumintState);
  const [hasMountedCanvas, setHasMountedCanvas] = useState(false);
  const [hostMetrics, setHostMetrics] = useState(defaultHostMetrics);
  const [surfaceWidth, setSurfaceWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(240);
  const [viewportTop, setViewportTop] = useState(0);
  const [viewportContentHeight, setViewportContentHeight] = useState(240);
  const [preferredTheme, setPreferredTheme] = useState<EditorTheme>(lightEditorTheme);
  const [componentState, setComponentState] = useState(defaultDocumintState);
  const ssrDocument = useMemo(() => parseMarkdown(content), [content]);
  const canonicalSsrContent = useMemo(
    () => serializeMarkdown(ssrDocument),
    [ssrDocument],
  );
  const [editorState, setEditorState] = useState(() => editor.createState(ssrDocument));
  const renderResources = useDocumentImages(editorState.documentEditor.document);
  const hasLoadingImages = useMemo(
    () => [...renderResources.images.values()].some((image) => image.status === "loading"),
    [renderResources],
  );

  editorStateRef.current = editorState;
  canonicalContentRef.current ||= canonicalSsrContent;

  const renderTheme = useMemo(() => theme ?? preferredTheme, [preferredTheme, theme]);
  const layoutWidth = resolveEditorSurfaceWidth(surfaceWidth, hostMetrics.width);
  const previewState = useMemo(() => editor.getPreviewState(editorState), [editor, editorState]);
  const commentState = useMemo(() => editor.getCommentState(editorState), [editor, editorState]);
  const normalizedSelection = useMemo(
    () => editor.normalizeSelection(editorState),
    [editor, editorState],
  );
  const absoluteSelection = useMemo(
    () => normalizeSelectionAbsolutePositions(editorState),
    [editorState],
  );
  const activeCommentThreadIndex = useMemo(
    () =>
      resolveActiveCommentThreadIndex(
        absoluteSelection.start,
        absoluteSelection.end,
        commentState.liveRanges,
      ),
    [absoluteSelection.end, absoluteSelection.start, commentState.liveRanges],
  );
  const canEditComments = Boolean(onContentChange);

  const publishState = useEffectEvent((state: typeof editorState, canonicalContent: string) => {
    const nextPreviewState = editor.getPreviewState(state);
    const nextCommentState = editor.getCommentState(state);
    const nextAbsoluteSelection = normalizeSelectionAbsolutePositions(state);
    const nextState: DocumintState = {
      activeBlockType: nextPreviewState.activeBlock?.nodeType ?? null,
      activeCommentThreadIndex: resolveActiveCommentThreadIndex(
        nextAbsoluteSelection.start,
        nextAbsoluteSelection.end,
        nextCommentState.liveRanges,
      ),
      activeSpanKind:
        nextPreviewState.activeSpan.kind === "none" ? null : nextPreviewState.activeSpan.kind,
      canonicalContent,
      characterCount: canonicalContent.length,
      commentThreadCount: nextCommentState.threads.length,
      docChangeCount: perfMetricsRef.current.docChangeCount,
      hostHeight: hostMetricsRef.current.height,
      hostWidth: hostMetricsRef.current.width,
      lastTransactionMs: perfMetricsRef.current.lastTransactionMs,
      layoutWidth: resolveEditorSurfaceWidth(surfaceWidthRef.current, hostMetricsRef.current.width),
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
      docChangeCount:
        perfMetricsRef.current.docChangeCount + (stateChange.documentChanged ? 1 : 0),
      lastTransactionMs: performance.now() - startedAt,
      transactionCount: perfMetricsRef.current.transactionCount + 1,
    };

    if (stateChange.animationStarted) {
      scheduleRender("document");
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

  const createViewportRenderData = useEffectEvent((): PreparedViewport => {
    const currentState = editorStateRef.current ?? editorState;
    const viewport = viewportMetricsRef.current;

    return editor.prepareViewport(currentState, {
      height: viewport.height,
      paddingX: renderTheme.paddingX,
      paddingY: renderTheme.paddingY,
      top: viewport.top,
      width: layoutWidth,
    }, renderResources);
  });

  const paintEditorSurface = useEffectEvent((renderData = viewportRenderDataRef.current) => {
    const canvas = canvasRef.current;

    if (!canvas || !renderData) {
      return;
    }

    const width = layoutWidth;
    const height = Math.max(240, Math.ceil(renderData.paintHeight));
    const devicePixelRatio = resolveCanvasDevicePixelRatio();

    canvas.width = Math.ceil(width * devicePixelRatio);
    canvas.height = Math.ceil(height * devicePixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.transform = `translateY(${renderData.paintTop}px)`;

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    editor.paintSurface(editorState, renderData, context, {
      activeBlockId: previewState.activeBlock?.blockId ?? null,
      activeRegionId: editorState.selection.focus.regionId,
      activeThreadIndex:
        hover.leaf?.kind === "comment" ? hover.leaf.threadIndex : activeCommentThreadIndex,
      devicePixelRatio,
      height,
      liveCommentRanges: commentState.liveRanges,
      normalizedSelection,
      now: performance.now(),
      resources: renderResources,
      theme: renderTheme,
      width,
    });
  });

  const paintCaretSurface = useEffectEvent((renderData = viewportRenderDataRef.current) => {
    const canvas = caretCanvasRef.current;

    if (!canvas || !renderData) {
      return;
    }

    const width = layoutWidth;
    const height = Math.max(240, Math.ceil(renderData.paintHeight));
    const devicePixelRatio = resolveCanvasDevicePixelRatio();

    canvas.width = Math.ceil(width * devicePixelRatio);
    canvas.height = Math.ceil(height * devicePixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.transform = `translateY(${renderData.paintTop}px)`;

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    editor.paintCaret(editorState, renderData, context, {
      devicePixelRatio,
      height,
      normalizedSelection,
      showCaret:
        normalizedSelection.start.regionId !== normalizedSelection.end.regionId ||
        normalizedSelection.start.offset !== normalizedSelection.end.offset ||
        cursor.isVisible(),
      theme: renderTheme,
      width,
    });
  });

  const renderDocumentLayer = useEffectEvent(() => {
    const renderData = createViewportRenderData();

    viewportRenderDataRef.current = renderData;
    setViewportContentHeight((previous) => {
      const nextHeight = Math.max(
        viewportMetricsRef.current.height,
        Math.ceil(renderData.totalHeight + 24),
      );

      return previous === nextHeight ? previous : nextHeight;
    });
    paintEditorSurface(renderData);
    paintCaretSurface(renderData);
  });

  const { scheduleRender } = useRenderScheduler({
    hasRunningDocumentAnimations: () =>
      editor.hasRunningAnimations(editorStateRef.current ?? editorState, performance.now()),
    renderCursorLayer: paintCaretSurface,
    renderDocumentLayer,
  });

  const getViewportRenderData = useEffectEvent(() => {
    const existing = viewportRenderDataRef.current;

    if (existing) {
      return existing;
    }

    const next = createViewportRenderData();

    viewportRenderDataRef.current = next;

    return next;
  });

  const cursor = useCursor({
    canShowInsertionLeaf: Boolean(onContentChange),
    canShowTableLeaf: Boolean(onContentChange),
    commentState,
    editor,
    editorState,
    onVisibilityChange: () => scheduleRender("cursor"),
    viewport: viewportRenderDataRef.current,
  });
  const hover = useHover({
    commentState,
    editor,
    editorStateRef,
    getViewportRenderData,
    resolvePointerPoint: resolveCanvasPointerPoint,
  });

  const handleViewportScroll = useEffectEvent((frame: HTMLDivElement) => {
    viewportMetricsRef.current = {
      height: Math.max(240, frame.clientHeight),
      top: frame.scrollTop,
    };
    setViewportTop((previous) =>
      previous === frame.scrollTop ? previous : frame.scrollTop,
    );
    scheduleRender("all");
  });

  const handleViewportWheel = useEffectEvent((frame: HTMLDivElement, event: WheelEvent) => {
    if (frame.scrollHeight <= frame.clientHeight || event.deltaY === 0) {
      return;
    }

    const lineHeight = 24;
    const deltaMultiplier =
      event.deltaMode === 1 ? lineHeight : event.deltaMode === 2 ? frame.clientHeight : 1;
    const nextTop = Math.max(
      0,
      Math.min(frame.scrollHeight - frame.clientHeight, frame.scrollTop + event.deltaY * deltaMultiplier),
    );

    if (nextTop === frame.scrollTop) {
      return;
    }

    event.preventDefault();
    frame.scrollTop = nextTop;
    handleViewportScroll(frame);
  });

  const handleEditorCopy = useEffectEvent(
    (event: ClipboardEvent<HTMLCanvasElement | HTMLTextAreaElement>) => {
      const currentState = editorStateRef.current;

      if (!currentState) {
        return;
      }

      const selectedText = readSingleContainerSelectionText(currentState);

      if (!selectedText) {
        return;
      }

      event.preventDefault();
      event.clipboardData.setData("text/plain", selectedText);
    },
  );

  const handleEditorCut = useEffectEvent(
    (event: ClipboardEvent<HTMLCanvasElement | HTMLTextAreaElement>) => {
      const currentState = editorStateRef.current;

      if (!currentState) {
        return;
      }

      const selectedText = readSingleContainerSelectionText(currentState);

      if (!selectedText) {
        return;
      }

      event.preventDefault();
      event.clipboardData.setData("text/plain", selectedText);
      cursor.markActivity();
      applyEditorStateChange(editor.deleteSelection(currentState));
    },
  );

  const handleEditorPaste = useEffectEvent(
    (event: ClipboardEvent<HTMLCanvasElement | HTMLTextAreaElement>) => {
      const currentState = editorStateRef.current;
      const pastedText = event.clipboardData.getData("text/plain");

      if (!currentState || pastedText.length === 0) {
        return;
      }

      event.preventDefault();
      cursor.markActivity();
      applyEditorStateChange(editor.replaceSelection(currentState, pastedText));
    },
  );
  const input = useNativeInput({
    editor,
    editorState,
    editorStateRef,
    getViewportRenderData,
    inputRef,
    onActivity: cursor.markActivity,
    onEditorStateChange: applyEditorStateChange,
  });
  const selection = useSelection({
    autoScrollFrame: (event) => {
      autoScrollSelectionFrame(frameRef.current, event);
    },
    canShowSelectionLeaf: canEditComments,
    canvasRef,
    threads: commentState.threads,
    editor,
    editorState,
    editorStateRef,
    frameRef,
    getViewportRenderData,
    onActivity: cursor.markActivity,
    onEditorStateChange: applyEditorStateChange,
  });

  useEffect(() => {
    if (theme) {
      return;
    }

    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      setPreferredTheme(mediaQuery.matches ? darkEditorTheme : lightEditorTheme);
    };

    updateTheme();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateTheme);

      return () => {
        mediaQuery.removeEventListener("change", updateTheme);
      };
    }

    mediaQuery.addListener(updateTheme);

    return () => {
      mediaQuery.removeListener(updateTheme);
    };
  }, [theme]);

  useEffect(() => {
    const host = hostRef.current;

    if (!host || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      const nextHostMetrics = readHostMetrics(entry);
      const windowObject = host.ownerDocument.defaultView;

      if (!windowObject) {
        return;
      }

      if (resizeFrameRef.current !== null) {
        windowObject.cancelAnimationFrame(resizeFrameRef.current);
      }

      resizeFrameRef.current = windowObject.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        hostMetricsRef.current = nextHostMetrics;
        setHostMetrics((previous) =>
          previous.height === nextHostMetrics.height && previous.width === nextHostMetrics.width
            ? previous
            : nextHostMetrics,
        );
      });
    });

    observer.observe(host);

    return () => {
      observer.disconnect();

      const windowObject = host.ownerDocument.defaultView;

      if (windowObject && resizeFrameRef.current !== null) {
        windowObject.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      const nextSurfaceWidth = Math.max(0, Math.floor(readContentMetrics(entry).width));
      const nextViewportHeight = Math.max(240, Math.floor(frame.clientHeight));

      surfaceWidthRef.current = nextSurfaceWidth;
      viewportMetricsRef.current = {
        ...viewportMetricsRef.current,
        height: nextViewportHeight,
      };
      setSurfaceWidth((previous) => (previous === nextSurfaceWidth ? previous : nextSurfaceWidth));
      setViewportHeight((previous) => (previous === nextViewportHeight ? previous : nextViewportHeight));
    });

    observer.observe(frame);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    setHasMountedCanvas(true);
  }, []);

  useEffect(() => {
    if (content === lastEmittedContentRef.current) {
      return;
    }

    viewportMetricsRef.current = {
      ...viewportMetricsRef.current,
      top: 0,
    };
    const frame = frameRef.current;

    if (frame) {
      frame.scrollTop = 0;
    }

    const nextState = editor.createState(ssrDocument);

    editorStateRef.current = nextState;
    setEditorState(nextState);
    lastEmittedContentRef.current = content;
    canonicalContentRef.current = canonicalSsrContent;
  }, [canonicalSsrContent, content, editor, ssrDocument]);

  useEffect(() => {
    publishState(editorState, canonicalContentRef.current || canonicalSsrContent);
  }, [canonicalSsrContent, editorState, hostMetrics.height, hostMetrics.width, publishState, surfaceWidth]);

  useEffect(() => {
    scheduleRender("all");
  }, [
    commentState.liveRanges,
    editorState,
    hover.leaf?.kind === "comment" ? hover.leaf.threadIndex : null,
    layoutWidth,
    normalizedSelection.end.regionId,
    normalizedSelection.end.offset,
    normalizedSelection.start.regionId,
    normalizedSelection.start.offset,
    previewState.activeBlock?.blockId,
    renderTheme,
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
      scheduleRender("document");
      frameId = windowObject.requestAnimationFrame(paintLoadingFrame);
    };

    frameId = windowObject.requestAnimationFrame(paintLoadingFrame);

    return () => {
      if (frameId !== null) {
        windowObject.cancelAnimationFrame(frameId);
      }
    };
  }, [hasLoadingImages, scheduleRender]);

  useEffect(() => {
    scheduleRender("cursor");
  }, [
    layoutWidth,
    normalizedSelection.end.regionId,
    normalizedSelection.end.offset,
    normalizedSelection.start.regionId,
    normalizedSelection.start.offset,
    renderTheme,
    scheduleRender,
  ]);

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame) {
      return;
    }

    const nativeHandleWheel = (event: WheelEvent) => {
      handleViewportWheel(frame, event);
    };

    frame.addEventListener("wheel", nativeHandleWheel, {
      passive: false,
    });

    return () => {
      frame.removeEventListener("wheel", nativeHandleWheel);
    };
  }, [handleViewportWheel]);

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame) {
      return;
    }

    const previousAutoScrolledCaret = lastAutoScrolledCaretRef.current;

    if (
      previousAutoScrolledCaret?.documentEditor === editorState.documentEditor &&
      previousAutoScrolledCaret.regionId === editorState.selection.focus.regionId &&
      previousAutoScrolledCaret.offset === editorState.selection.focus.offset &&
      previousAutoScrolledCaret.layoutWidth === layoutWidth &&
      previousAutoScrolledCaret.hostHeight === hostMetrics.height
    ) {
      return;
    }

    lastAutoScrolledCaretRef.current = {
      regionId: editorState.selection.focus.regionId,
      hostHeight: hostMetrics.height,
      layoutWidth,
      offset: editorState.selection.focus.offset,
      documentEditor: editorState.documentEditor,
    };

    const caret = editor.measureCaretTarget(editorState, getViewportRenderData(), {
      regionId: editorState.selection.focus.regionId,
      offset: editorState.selection.focus.offset,
    });

    if (!caret) {
      return;
    }

    const padding = 24;
    const top = caret.top;
    const bottom = caret.top + caret.height;

    if (top < frame.scrollTop + padding) {
      frame.scrollTop = Math.max(0, top - padding);
      return;
    }

    const viewportBottom = frame.scrollTop + frame.clientHeight - padding;

    if (bottom > viewportBottom) {
      frame.scrollTop = Math.max(0, bottom - frame.clientHeight + padding);
    }
  }, [
    editorState.documentEditor,
    editorState.selection.focus.regionId,
    editorState.selection.focus.offset,
    getViewportRenderData,
    hostMetrics.height,
    layoutWidth,
  ]);

  const sectionClassName = className
    ? `documint-editor ${className}`
    : "documint-editor";
  const readCurrentState = () => editorStateRef.current ?? editorState;
  const hoveredLeaf = hover.leaf;
  const visibleLeaf = hoveredLeaf ?? selection.leaf ?? cursor.leaf;
  const isSelectionLeafVisible = !hoveredLeaf && Boolean(selection.leaf);
  const frameBounds = frameRef.current?.getBoundingClientRect() ?? null;
  const leafLeft = visibleLeaf
    ? (frameBounds?.left ?? 0) + visibleLeaf.left
    : 0;
  const leafTop = visibleLeaf
    ? (frameBounds?.top ?? 0) +
      visibleLeaf.top -
      viewportTop +
      (isSelectionLeafVisible ? selectionLeafVerticalOffset : 0)
    : 0;
  const visibleThreadLeaf =
    visibleLeaf?.kind === "thread"
      ? {
          ...visibleLeaf,
          thread: commentState.threads[visibleLeaf.threadIndex] ?? null,
        }
      : null;
  const visibleLeafAnchor: LeafPortalAnchor | undefined = visibleLeaf
    ? {
        container: hostRef.current,
        isSelection: isSelectionLeafVisible,
        left: leafLeft,
        onPointerEnter: hoveredLeaf ? hover.leafHandlers.onPointerEnter : undefined,
        onPointerLeave: hoveredLeaf ? hover.leafHandlers.onPointerLeave : undefined,
        top: leafTop,
      }
    : undefined;
  const visibleLeafClassName = visibleLeaf?.kind === "link" ? "documint-editor-link-leaf" : undefined;
  const visibleLeafStatus =
    visibleLeaf?.kind === "comment" && isResolvedCommentThread(visibleLeaf.thread)
      ? "resolved"
      : visibleThreadLeaf?.thread && isResolvedCommentThread(visibleThreadLeaf.thread)
      ? "resolved"
      : "default";
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
  const visibleLeafContent =
    !visibleLeaf ? null : visibleLeaf.kind === "insertion" ? (
      <InsertionLeaf
        onInsert={(text) => {
          applyEditorStateChange(editor.insertText(readCurrentState(), text));
        }}
        onInsertTable={(columnCount) => {
          applyEditorStateChange(editor.insertTable(readCurrentState(), columnCount));
        }}
      />
    ) : visibleLeaf.kind === "table" ? (
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
    ) : visibleLeaf.kind === "link" ? (
      <LinkLeaf
        canEdit={Boolean(onContentChange)}
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
    ) : visibleLeaf.kind === "create" ? (
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
          applyEditorStateChange(editor.dispatchCommand(readCurrentState(), "toggleSelectionBold"));
        }}
        onToggleItalic={() => {
          applyEditorStateChange(editor.dispatchCommand(readCurrentState(), "toggleSelectionItalic"));
        }}
        onToggleStrikethrough={() => {
          applyEditorStateChange(editor.dispatchCommand(readCurrentState(), "toggleSelectionStrikethrough"));
        }}
        onToggleUnderline={() => {
          applyEditorStateChange(editor.dispatchCommand(readCurrentState(), "toggleSelectionUnderline"));
        }}
      />
    ) : annotationThreadLeaf ? (
      <AnnotationLeaf
        canEdit={canEditComments}
        animateInitialComment={annotationThreadLeaf.animateInitialComment}
        link={annotationThreadLeaf.link}
        mode="thread"
        onDeleteComment={(commentIndex) => {
          applyEditorStateChange(
            editor.deleteComment(readCurrentState(), annotationThreadLeaf.threadIndex, commentIndex),
          );
        }}
        onDeleteThread={() => {
          applyEditorStateChange(
            editor.deleteCommentThread(readCurrentState(), annotationThreadLeaf.threadIndex),
          );
        }}
        onEditComment={(commentIndex, body) => {
          applyEditorStateChange(
            editor.editComment(readCurrentState(), annotationThreadLeaf.threadIndex, commentIndex, body),
          );
        }}
        onReply={(body) => {
          applyEditorStateChange(
            editor.replyToCommentThread(readCurrentState(), annotationThreadLeaf.threadIndex, body),
          );
        }}
        onToggleResolved={() => {
          applyEditorStateChange(
            editor.setCommentThreadResolved(
              readCurrentState(),
              annotationThreadLeaf.threadIndex,
              !isResolvedCommentThread(annotationThreadLeaf.thread),
            ),
          );
        }}
        thread={annotationThreadLeaf.thread}
      />
    ) : null;

  return (
    <section
      className={sectionClassName}
      data-active-block={componentState.activeBlockType ?? ""}
      data-active-comment-thread={componentState.activeCommentThreadIndex ?? ""}
      data-active-span={componentState.activeSpanKind ?? ""}
      ref={hostRef}
      style={{
        "--documint-leaf-button-bg": renderTheme.leafButtonBackground,
        "--documint-leaf-button-border": renderTheme.leafButtonBorder,
        "--documint-leaf-button-text": renderTheme.leafButtonText,
        "--documint-leaf-accent": renderTheme.leafAccent,
        "--documint-leaf-bg": renderTheme.leafBackground,
        "--documint-leaf-border": renderTheme.leafBorder,
        "--documint-leaf-shadow": renderTheme.leafShadow ?? undefined,
        "--documint-leaf-secondary-text": renderTheme.leafSecondaryText,
        "--documint-leaf-resolved-bg": renderTheme.leafResolvedBackground,
        "--documint-leaf-resolved-border": renderTheme.leafResolvedBorder,
        "--documint-leaf-text": renderTheme.leafText,
        "--documint-selection-handle-bg": renderTheme.selectionHandleBackground,
        "--documint-selection-handle-border": renderTheme.selectionHandleBorder,
        height: "100%",
        minHeight: 0,
      } as CSSProperties}
    >
      <style>{DOCUMINT_EDITOR_STYLES}</style>
      <div
        className="documint-editor-frame"
        onScroll={(event) => {
          handleViewportScroll(event.currentTarget);
        }}
        ref={frameRef}
        style={{
          height: "100%",
          minHeight: 0,
        }}
      >
        <textarea
          aria-label="Documint input bridge"
          autoCapitalize="sentences"
          className="documint-editor-input"
          onBeforeInput={input.hiddenInputProps.onBeforeInput}
          onCopy={handleEditorCopy}
          onCut={handleEditorCut}
          onFocus={input.hiddenInputProps.onFocus}
          onInput={input.hiddenInputProps.onInput}
          onKeyDown={input.hiddenInputProps.onKeyDown}
          onPaste={handleEditorPaste}
          ref={inputRef}
          spellCheck={false}
          tabIndex={-1}
        />
        <div
          className="documint-editor-viewport"
          style={{
            height: `${viewportContentHeight}px`,
          }}
        >
          <canvas
            aria-label="Documint editor"
            className="documint-editor-canvas"
            style={{
              cursor: hover.cursor,
            }}
            onBeforeInput={input.canvasInputProps.onBeforeInput}
            onCopy={handleEditorCopy}
            onCut={handleEditorCut}
            onFocus={input.canvasInputProps.onFocus}
            onKeyDown={input.canvasInputProps.onKeyDown}
            onPaste={handleEditorPaste}
            onPointerCancel={(event) => {
              const canvas = canvasRef.current;

              if (canvas && dragPointerIdRef.current === event.pointerId) {
                canvas.releasePointerCapture(event.pointerId);
              }

              dragPointerIdRef.current = null;
              dragAnchorRef.current = null;
              pendingTaskToggleRef.current = null;
              handledTaskToggleClickRef.current = false;
            }}
            onPointerDown={(event) => {
              const canvas = canvasRef.current;
              const currentState = editorStateRef.current;
              const viewport = getViewportRenderData();
              const point = resolveCanvasPointerPoint(event);

              if (!currentState) {
                return;
              }

              const target = hover.resolveTarget(event);

              if (target?.kind === "task-toggle") {
                event.preventDefault();
                event.stopPropagation();
                pendingTaskToggleRef.current = target.listItemId;
                cursor.markActivity();
                canvas?.focus({
                  preventScroll: true,
                });
                return;
              }

              const hit = editor.resolveSelectionHit(currentState, viewport, point);

              if (!canvas || !hit) {
                return;
              }

              dragPointerIdRef.current = event.pointerId;
              dragAnchorRef.current = {
                regionId: hit.regionId,
                offset: hit.offset,
              };
              cursor.markActivity();
              canvas.setPointerCapture(event.pointerId);
              canvas.focus({
                preventScroll: true,
              });
              applyEditorStateChange(
                editor.setSelection(currentState, {
                  regionId: hit.regionId,
                  offset: hit.offset,
                }),
              );
              input.focusInput();
            }}
            onPointerLeave={() => {
              hover.canvasHandlers.onPointerLeave();
              handledTaskToggleClickRef.current = false;
            }}
            onPointerMove={(event) => {
              const anchor = dragAnchorRef.current;
              const currentState = editorStateRef.current;
              const viewport = getViewportRenderData();
              const point = resolveCanvasPointerPoint(event);

              if (!currentState) {
                return;
              }

              hover.canvasHandlers.onPointerMove(event);

              if (dragPointerIdRef.current !== event.pointerId || !anchor) {
                return;
              }

              const nextFocus = editor.resolveDragFocus(
                currentState,
                viewport,
                point,
                anchor,
                event.currentTarget.getBoundingClientRect().top,
              );

              if (!nextFocus) {
                return;
              }

              cursor.markActivity();
              autoScrollSelectionFrame(frameRef.current, event);
              applyEditorStateChange(
                editor.setSelection(currentState, {
                  anchor,
                  focus: nextFocus,
                }),
              );
            }}
            onPointerUp={(event) => {
              const canvas = canvasRef.current;
              const currentState = editorStateRef.current;

              if (canvas && dragPointerIdRef.current === event.pointerId) {
                canvas.releasePointerCapture(event.pointerId);
              }

              if (currentState && pendingTaskToggleRef.current) {
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

              dragPointerIdRef.current = null;
              dragAnchorRef.current = null;
            }}
            onClick={(event) => {
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
              input.focusInput();
            }}
            onDoubleClick={(event) => {
              const currentState = editorStateRef.current;
              const viewport = getViewportRenderData();
              const point = resolveCanvasPointerPoint(event);
              const target = hover.resolveTarget(event);

              if (!currentState || target?.kind === "task-toggle") {
                return;
              }

              const selection = editor.resolveWordSelection(currentState, viewport, point);

              if (!selection) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              cursor.markActivity();
              applyEditorStateChange(editor.setSelection(currentState, selection));
              input.focusInput();
            }}
            ref={canvasRef}
            tabIndex={0}
          />
          <canvas
            aria-hidden="true"
            className="documint-editor-caret"
            ref={caretCanvasRef}
          />
          {selection.handles ? (
            <>
              <div
                aria-hidden="true"
                className="documint-editor-selection-handle documint-editor-selection-handle-start"
                style={{
                  left: `${selection.handles.start.left}px`,
                  top: `${selection.handles.start.top}px`,
                }}
                {...selection.startHandleProps}
              >
                <span className="documint-editor-selection-handle-knob" />
              </div>
              <div
                aria-hidden="true"
                className="documint-editor-selection-handle documint-editor-selection-handle-end"
                style={{
                  left: `${selection.handles.end.left}px`,
                  top: `${selection.handles.end.top}px`,
                }}
                {...selection.endHandleProps}
              >
                <span className="documint-editor-selection-handle-knob" />
              </div>
            </>
          ) : null}
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
        {!hasMountedCanvas ? (
          <div className="documint-editor-fallback">
            <DocumintSsr blocks={ssrDocument.blocks} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function resolveCanvasPointerPoint(
  event:
    | PointerEvent<HTMLCanvasElement>
    | MouseEvent<HTMLCanvasElement>,
) {
  const bounds = event.currentTarget.getBoundingClientRect();
  const frame = event.currentTarget.parentElement;

  return {
    x: event.clientX - bounds.left + (frame?.scrollLeft ?? 0),
    y: event.clientY - bounds.top + (frame?.scrollTop ?? 0),
  };
}

function countLines(content: string) {
  return content.length === 0 ? 0 : content.split("\n").length;
}

function resolveActiveCommentThreadIndex(
  selectionStart: number,
  selectionEnd: number,
  liveRanges: { end: number; start: number; threadIndex: number }[],
) {
  for (const range of liveRanges) {
    if (selectionStart === selectionEnd) {
      if (selectionStart >= range.start && selectionStart <= range.end) {
        return range.threadIndex;
      }

      continue;
    }

    if (Math.max(selectionStart, range.start) < Math.min(selectionEnd, range.end)) {
      return range.threadIndex;
    }
  }

  return null;
}
