/**
 * Resize and surface sizing helpers for the React host layer.
 */
export type HostMetrics = {
  height: number;
  width: number;
};

export type ContentMetrics = {
  height: number;
  width: number;
};

export const defaultHostMetrics: HostMetrics = {
  height: 0,
  width: 0,
};

export type ResizeObserverLikeEntry = {
  borderBoxSize?:
    | {
        blockSize?: number;
        inlineSize?: number;
      }
    | ReadonlyArray<{
        blockSize?: number;
        inlineSize?: number;
      }>;
  contentRect: {
    height: number;
    width: number;
  };
};

export function readHostMetrics(entry: ResizeObserverLikeEntry): HostMetrics {
  const box = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;

  return {
    height: box?.blockSize ?? entry.contentRect.height,
    width: box?.inlineSize ?? entry.contentRect.width,
  };
}

export function readContentMetrics(entry: ResizeObserverLikeEntry): ContentMetrics {
  return {
    height: entry.contentRect.height,
    width: entry.contentRect.width,
  };
}

export function resolveEditorSurfaceWidth(surfaceWidth: number, fallbackWidth: number) {
  return Math.max(240, Math.floor(surfaceWidth || fallbackWidth || 480));
}
