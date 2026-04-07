// Editor model type definitions: the runtime representation of a document
// as flattened roots, blocks, regions, editor inlines, lookup indexes, and
// the action union that describes document reductions.
import type { Block, Document, Mark } from "@/document";
import type { EditorSelection, SelectionTarget } from "../selection";

export type RuntimeLinkAttributes = {
  title: string | null;
  url: string;
};

export type RuntimeImageAttributes = {
  alt: string | null;
  title: string | null;
  url: string;
  width: number | null;
};

export type EditorInline = {
  end: number;
  id: string;
  image: RuntimeImageAttributes | null;
  inlineCode: boolean;
  kind: "break" | "image" | "inlineCode" | "text" | "unsupported";
  link: RuntimeLinkAttributes | null;
  marks: Mark[];
  originalType: string | null;
  start: number;
  text: string;
};

// Internal optimization type used by the build/rebuild system to group
// blocks and regions by top-level document block for incremental updates.
export type EditorRootRange = {
  end: number;
  start: number;
};

export type EditorListItemMarker =
  | { checked: boolean; kind: "task" }
  | { kind: "bullet"; label: "\u2022" }
  | { kind: "ordered"; label: string };

export type EditorRegion = {
  blockId: string;
  blockType: Block["type"];
  end: number;
  id: string;
  path: string;
  rootIndex: number;
  inlines: EditorInline[];
  semanticRegionId: string;
  start: number;
  tableCellPosition: { cellIndex: number; rowIndex: number } | null;
  text: string;
};

export type EditorBlock = {
  childBlockIds: string[];
  depth: number;
  end: number;
  id: string;
  parentBlockId: string | null;
  path: string;
  regionIds: string[];
  rootIndex: number;
  start: number;
  type: Block["type"];
};

// Internal optimization type used by the build/rebuild system. Groups all
// blocks and regions from a single top-level document block, enabling
// incremental model rebuilds that only reprocess the affected root.
export type EditorRoot = {
  blockRange: EditorRootRange;
  blocks: EditorBlock[];
  end: number;
  length: number;
  regionRange: EditorRootRange | undefined;
  regions: EditorRegion[];
  rootIndex: number;
  start: number;
  text: string;
};

// A flat, indexed projection of a `Document` for the editing engine: pre-flattened
// blocks/regions, character-offset coordinates, and lookup tables for O(1) hot-path
// access. Holds a reference back to the source `document`; carries no semantic
// content of its own — every field is either a coordinate, a topology aid, an
// index, or a runtime presentation projection. Equivalent to the "editor model"
// concept in editor libraries like ProseMirror or CodeMirror.
export type DocumentIndex = {
  blockIndex: Map<string, EditorBlock>;
  blocks: EditorBlock[];
  commentContainerIndex: Map<string, number[]>;
  document: Document;
  engine: "canvas";
  length: number;
  listItemMarkers: Map<string, EditorListItemMarker>;
  regionIndex: Map<string, EditorRegion>;
  regionOrderIndex: Map<string, number>;
  regionPathIndex: Map<string, EditorRegion>;
  regions: EditorRegion[];
  roots: EditorRoot[];
  tableCellIndex: Map<string, { cellIndex: number; rowIndex: number }>;
  tableCellRegionIndex: Map<string, string>;
  text: string;
};

export type ActionSelection = EditorSelection | SelectionTarget;

export type EditorAction =
  | {
      kind: "replace-block";
      block: Block;
      blockId: string;
      listItemInsertedPath?: string;
      selection?: ActionSelection | null;
    }
  | {
      kind: "replace-root";
      block: Block;
      rootIndex: number;
      selection?: ActionSelection | null;
    }
  | {
      kind: "replace-root-range";
      count: number;
      replacements: Block[];
      rootIndex: number;
      selection?: ActionSelection | null;
    }
  | {
      kind: "replace-selection";
      selection: EditorSelection;
      text: string;
    };

export type EditorStateAction =
  | EditorAction
  | { kind: "keep-state" }
  | { kind: "set-selection"; selection: EditorSelection };
