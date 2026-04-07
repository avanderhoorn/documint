import { useEffect, useEffectEvent, useRef } from "react";

export type RenderLayer = "all" | "cursor" | "document";

type UseRenderSchedulerOptions = {
  hasRunningDocumentAnimations?: () => boolean;
  renderCursorLayer: () => void;
  renderDocumentLayer: () => void;
};

type RenderScheduler = {
  scheduleRender: (layer: RenderLayer) => void;
};

/**
 * Coalesces document and cursor paint requests into a single animation-frame
 * scheduler so multiple host invalidations do not trigger duplicate paints.
 * The document layer is allowed to subsume cursor repainting when the host's
 * full document render already repaints both canvases together.
 */
export function useRenderScheduler({
  hasRunningDocumentAnimations,
  renderCursorLayer,
  renderDocumentLayer,
}: UseRenderSchedulerOptions): RenderScheduler {
  const frameIdRef = useRef<number | null>(null);
  const pendingDocumentRef = useRef(false);
  const pendingCursorRef = useRef(false);

  const requestFrame = useEffectEvent(() => {
    if (typeof window === "undefined" || frameIdRef.current !== null) {
      return;
    }

    frameIdRef.current = window.requestAnimationFrame(() => {
      flushRenderRequests();
    });
  });

  const flushRenderRequests = useEffectEvent(() => {
    frameIdRef.current = null;

    const shouldRenderDocument = pendingDocumentRef.current;
    const shouldRenderCursor = pendingCursorRef.current;

    pendingDocumentRef.current = false;
    pendingCursorRef.current = false;

    if (shouldRenderDocument) {
      renderDocumentLayer();

      if (hasRunningDocumentAnimations?.()) {
        pendingDocumentRef.current = true;
        requestFrame();
      }

      return;
    }

    if (shouldRenderCursor) {
      renderCursorLayer();
    }
  });

  const scheduleRender = useEffectEvent((layer: RenderLayer) => {
    if (typeof window === "undefined") {
      if (layer === "document" || layer === "all") {
        renderDocumentLayer();
        return;
      }

      renderCursorLayer();
      return;
    }

    pendingDocumentRef.current ||= layer === "all" || layer === "document";
    pendingCursorRef.current ||= layer === "all" || layer === "cursor";
    requestFrame();
  });

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
