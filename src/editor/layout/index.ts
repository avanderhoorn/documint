// Public document-geometry boundary for the editor layout subsystem. This surface
// answers where content is, which line or region a point lands in, and
// where a caret should render within the prepared layout.

export type {
  DocumentCaretTarget as CaretTarget,
  DocumentLayout,
  DocumentHitTestResult as LayoutSelectionHit,
  DocumentLayoutLine as LayoutLine,
  DocumentLayoutOptions as LayoutOptions,
  DocumentLineBoundary as LineBoundary,
  LayoutEstimate,
} from "./document";

export {
  // Build and estimate document geometry.
  createDocumentLayout,
  estimateLayout,

  // Resolve lines within the prepared layout.
  findDocumentLayoutLineAtPoint as findLineAtPoint,
  findDocumentLayoutLineAtY as findLineAtY,
  findDocumentLayoutLineEntryForRegionOffset as findLineEntryForRegionOffset,
  findDocumentLayoutLineForRegionOffset as findLineForRegionOffset,
  findDocumentLayoutLineRange as findVisibleLineRange,
  findNearestDocumentLayoutLineForRegion as findNearestLineInRegion,

  // Resolve selection and caret geometry.
  hitTestDocumentLayout as resolveSelectionHit,
  measureDocumentCaretTarget as measureCaretTarget,
  measureCanvasLineOffsetLeft as measureLineOffsetLeft,
} from "./document";
