import { useEffect, useEffectEvent, useRef, type RefObject } from "react";
import { hasRunningAnimations, type EditorState } from "@/editor";

/**
 * The granularity of a paint request.
 *
 * - `viewport` — layout may have changed; recompute it and repaint every
 *   layer that depends on it. Subsumes `content` and `overlay` in the same
 *   frame.
 * - `content` — document content needs repainting (selection, comments,
 *   hover) but layout is unchanged. Subsumes a same-frame `overlay`.
 * - `overlay` — only cursor and presence indicators need repainting. The
 *   cheapest mode.
 */
export type RenderMode = "viewport" | "content" | "overlay";

type UseRenderSchedulerOptions = {
  /**
   * Live ref to the editor state. Read after each frame to decide whether
   * to keep the loop ticking for in-flight animations.
   */
  editorStateRef: RefObject<EditorState | null>;
  /** Repaint the content layer using the cached viewport layout. */
  renderContent: () => void;
  /** Repaint the overlay layer (cursor, presence). */
  renderOverlay: () => void;
  /** Recompute layout, then repaint the content and overlay layers. */
  renderViewport: () => void;
};

type RenderScheduler = {
  /**
   * Mark a layer dirty for the next frame. Multiple calls within the same
   * tick coalesce into a single rAF; higher-priority modes subsume lower
   * ones.
   */
  scheduleRender: (mode: RenderMode) => void;
};

/**
 * Owns the rAF render loop for a Documint instance.
 *
 * The host component's responsibilities are narrow:
 *   1. Provide one paint callback per layer plus a ref to the current
 *      editor state.
 *   2. Call `scheduleRender(mode)` whenever something invalidates a layer.
 *
 * Everything else lives here:
 *   - **Coalescing.** Multiple `scheduleRender` calls within a tick produce
 *     one rAF. Inside that frame, layers are dispatched in priority order
 *     (viewport → content → overlay) with higher modes subsuming lower
 *     ones.
 *   - **Animation continuation.** After any layout-aware frame, the
 *     scheduler asks the editor whether animations are still running and
 *     self-schedules a follow-up content paint if so. The host does not
 *     drive its own loop for animations.
 *   - **Lifecycle.** Any in-flight rAF is cancelled on unmount.
 *
 * On the server, paint callbacks are dispatched synchronously. The canvases
 * don't exist there, so the calls are effectively no-ops — but this keeps
 * the contract ("a scheduled render always eventually runs") consistent.
 */
export function useRenderScheduler({
  editorStateRef,
  renderContent,
  renderOverlay,
  renderViewport,
}: UseRenderSchedulerOptions): RenderScheduler {
  const frameIdRef = useRef<number | null>(null);
  const pendingViewportRef = useRef(false);
  const pendingContentRef = useRef(false);
  const pendingOverlayRef = useRef(false);

  // The host's entry point: mark a layer dirty and ensure a frame is queued.
  const scheduleRender = useEffectEvent((mode: RenderMode) => {
    if (typeof window === "undefined") {
      // No rAF on the server; dispatch synchronously.
      switch (mode) {
        case "viewport":
          renderViewport();
          return;
        case "content":
          renderContent();
          return;
        case "overlay":
          renderOverlay();
          return;
      }
    }

    switch (mode) {
      case "viewport":
        pendingViewportRef.current = true;
        break;
      case "content":
        pendingContentRef.current = true;
        break;
      case "overlay":
        pendingOverlayRef.current = true;
        break;
    }

    requestFrame();
  });

  // Ensures at most one rAF is outstanding at a time.
  const requestFrame = useEffectEvent(() => {
    if (typeof window === "undefined" || frameIdRef.current !== null) {
      return;
    }

    frameIdRef.current = window.requestAnimationFrame(() => {
      flushRenderRequests();
    });
  });

  // The rAF callback. Drains pending bits and dispatches paints in priority
  // order: viewport subsumes content+overlay; content absorbs a same-frame
  // overlay request.
  const flushRenderRequests = useEffectEvent(() => {
    frameIdRef.current = null;

    const shouldRenderViewport = pendingViewportRef.current;
    const shouldRenderContent = pendingContentRef.current;
    const shouldRenderOverlay = pendingOverlayRef.current;

    pendingViewportRef.current = false;
    pendingContentRef.current = false;
    pendingOverlayRef.current = false;

    if (shouldRenderViewport) {
      renderViewport();
      scheduleAnimationContinuation();
      return;
    }

    if (shouldRenderContent) {
      renderContent();

      if (shouldRenderOverlay) {
        renderOverlay();
      }

      scheduleAnimationContinuation();
      return;
    }

    if (shouldRenderOverlay) {
      renderOverlay();
    }
  });

  // After any layout-aware frame, keep the loop ticking while the editor has
  // running animations. Overlay-only frames don't trigger continuation: the
  // overlay layer isn't driven by the editor animation system.
  const scheduleAnimationContinuation = useEffectEvent(() => {
    const state = editorStateRef.current;
    if (!state || !hasRunningAnimations(state, performance.now())) {
      return;
    }

    pendingContentRef.current = true;
    requestFrame();
  });

  // Cancel any in-flight frame on unmount so we don't paint into a torn-down
  // canvas.
  useEffect(() => {
    return () => {
      if (typeof window === "undefined" || frameIdRef.current === null) {
        return;
      }

      window.cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = null;
    };
  }, []);

  return {
    scheduleRender,
  };
}
