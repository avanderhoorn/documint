/**
 * Small canvas-host helpers that keep render-specific details out of the main
 * component body.
 */
import type { DocumintState } from "../Documint";

export function resolveCanvasDevicePixelRatio() {
  if (typeof window === "undefined") {
    return 1;
  }

  return Math.max(1, window.devicePixelRatio || 1);
}

export function areStatesEqual(previous: DocumintState, next: DocumintState) {
  return (
    previous.activeBlockType === next.activeBlockType &&
    previous.activeCommentThreadIndex === next.activeCommentThreadIndex &&
    previous.activeSpanKind === next.activeSpanKind &&
    previous.canonicalContent === next.canonicalContent &&
    previous.characterCount === next.characterCount &&
    previous.commentThreadCount === next.commentThreadCount &&
    previous.docChangeCount === next.docChangeCount &&
    previous.hostHeight === next.hostHeight &&
    previous.hostWidth === next.hostWidth &&
    previous.lastTransactionMs === next.lastTransactionMs &&
    previous.layoutWidth === next.layoutWidth &&
    previous.lineCount === next.lineCount &&
    previous.resolvedCommentCount === next.resolvedCommentCount &&
    previous.selectionFrom === next.selectionFrom &&
    previous.selectionTo === next.selectionTo &&
    previous.transactionCount === next.transactionCount
  );
}
