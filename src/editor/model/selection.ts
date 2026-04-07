import type { Block } from "@/document";
import type { DocumentIndex } from "./types";
import { createTableCellRegionKey, SELECTION_ORDER_MULTIPLIER } from "./shared";

// Selection types, normalization, and target resolution. Converts between
// abstract SelectionTargets and concrete EditorSelections.

export type EditorSelectionPoint = {
  regionId: string;
  offset: number;
};

export type EditorSelection = {
  anchor: EditorSelectionPoint;
  focus: EditorSelectionPoint;
};

export type NormalizedEditorSelection = {
  end: EditorSelectionPoint;
  start: EditorSelectionPoint;
};

export type RegionRangePathSelectionTarget = {
  endOffset: number;
  kind: "region-range-path";
  path: string;
  startOffset: number;
};

export type SelectionTarget =
  | {
      kind: "descendant-primary-region";
      childIndices: number[];
      offset: number | "end";
      rootIndex: number;
    }
  | {
      kind: "region-path";
      offset: number | "end";
      path: string;
    }
  | RegionRangePathSelectionTarget
  | {
      kind: "root-primary-region";
      offset: number | "end";
      rootIndex: number;
    }
  | {
      cellIndex: number;
      kind: "table-cell";
      offset: number | "end";
      rootIndex: number;
      rowIndex: number;
    };

export function createDescendantPrimaryRegionTarget(
  rootIndex: number,
  childIndices: number[],
  offset: number | "end" = 0,
): SelectionTarget {
  return {
    childIndices,
    kind: "descendant-primary-region",
    offset,
    rootIndex,
  };
}

export function createRootPrimaryRegionTarget(
  rootIndex: number,
  offset: number | "end" = 0,
): SelectionTarget {
  return {
    kind: "root-primary-region",
    offset,
    rootIndex,
  };
}

export function createTableCellTarget(
  rootIndex: number,
  rowIndex: number,
  cellIndex: number,
  offset: number | "end" = 0,
): SelectionTarget {
  return {
    cellIndex,
    kind: "table-cell",
    offset,
    rootIndex,
    rowIndex,
  };
}

export function resolveRegion(documentIndex: DocumentIndex, regionId: string) {
  return documentIndex.regionIndex.get(regionId) ?? null;
}

export function resolveRegionByPath(documentIndex: DocumentIndex, path: string) {
  return documentIndex.regionPathIndex.get(path) ?? null;
}

export function resolveTableCellRegion(
  documentIndex: DocumentIndex,
  blockId: string,
  rowIndex: number,
  cellIndex: number,
) {
  const regionId = documentIndex.tableCellRegionIndex.get(
    createTableCellRegionKey(blockId, rowIndex, cellIndex),
  );

  return regionId ? (documentIndex.regionIndex.get(regionId) ?? null) : null;
}

export function normalizeSelection(
  documentIndex: DocumentIndex,
  selection: EditorSelection,
): NormalizedEditorSelection {
  const anchorOrder = resolveSelectionOrder(documentIndex, selection.anchor);
  const focusOrder = resolveSelectionOrder(documentIndex, selection.focus);

  if (anchorOrder <= focusOrder) {
    return {
      end: selection.focus,
      start: selection.anchor,
    };
  }

  return {
    end: selection.anchor,
    start: selection.focus,
  };
}

export function resolveSelectionTarget(
  documentIndex: DocumentIndex,
  selection: EditorSelection | SelectionTarget | null,
) {
  if (!selection) {
    return null;
  }

  if ("kind" in selection) {
    if (selection.kind === "root-primary-region") {
      const block = documentIndex.document.blocks[selection.rootIndex];
      const region = block ? resolvePrimaryRegion(documentIndex, block) : null;

      return region
        ? createCollapsedSelection(region.id, resolveRegionOffset(region.text, selection.offset))
        : null;
    }

    if (selection.kind === "descendant-primary-region") {
      const rootBlock = documentIndex.document.blocks[selection.rootIndex];
      const block = rootBlock ? resolveDescendantBlock(rootBlock, selection.childIndices) : null;
      const region = block ? resolvePrimaryRegion(documentIndex, block) : null;

      return region
        ? createCollapsedSelection(region.id, resolveRegionOffset(region.text, selection.offset))
        : null;
    }

    if (selection.kind === "table-cell") {
      const rootBlock = documentIndex.document.blocks[selection.rootIndex];

      if (!rootBlock || rootBlock.type !== "table") {
        return null;
      }

      const region = resolveTableCellRegion(
        documentIndex,
        rootBlock.id,
        selection.rowIndex,
        selection.cellIndex,
      );

      return region
        ? createCollapsedSelection(region.id, resolveRegionOffset(region.text, selection.offset))
        : null;
    }

    const region = resolveRegionByPath(documentIndex, selection.path);

    if (!region) {
      return null;
    }

    if (selection.kind === "region-path") {
      return createCollapsedSelection(
        region.id,
        resolveRegionOffset(region.text, selection.offset),
      );
    }

    return {
      anchor: {
        regionId: region.id,
        offset: Math.max(0, Math.min(selection.startOffset, region.text.length)),
      },
      focus: {
        regionId: region.id,
        offset: Math.max(0, Math.min(selection.endOffset, region.text.length)),
      },
    };
  }

  return selection;
}

function resolveSelectionOrder(documentIndex: DocumentIndex, point: EditorSelectionPoint) {
  const regionIndex = documentIndex.regionOrderIndex.get(point.regionId);

  if (regionIndex === undefined) {
    throw new Error(`Unknown canvas region: ${point.regionId}`);
  }

  return regionIndex * SELECTION_ORDER_MULTIPLIER + point.offset;
}

function createCollapsedSelection(regionId: string, offset: number): EditorSelection {
  const point = { offset, regionId };

  return {
    anchor: point,
    focus: point,
  };
}

function resolveRegionOffset(text: string, offset: number | "end") {
  return offset === "end" ? text.length : Math.max(0, Math.min(offset, text.length));
}

function resolveDescendantBlock(rootBlock: Block, childIndices: number[]) {
  let current: Block | null = rootBlock;

  for (const childIndex of childIndices) {
    if (!current) {
      return null;
    }

    const children = resolveBlockChildren(current);

    if (!children) {
      return null;
    }

    current = children[childIndex] ?? null;
  }

  return current;
}

function resolvePrimaryRegion(
  documentIndex: DocumentIndex,
  block: Block,
): DocumentIndex["regions"][number] | null {
  const entry = documentIndex.blockIndex.get(block.id);

  if (!entry) {
    return null;
  }

  const regionId = entry.regionIds[0];

  if (regionId) {
    return documentIndex.regionIndex.get(regionId) ?? null;
  }

  const children = resolveBlockChildren(block);

  if (!children) {
    return null;
  }

  for (const child of children) {
    const region: DocumentIndex["regions"][number] | null = resolvePrimaryRegion(documentIndex, child);

    if (region) {
      return region;
    }
  }

  return null;
}

function resolveBlockChildren(block: Block) {
  switch (block.type) {
    case "list":
      return block.items;
    case "blockquote":
    case "listItem":
      return block.children;
    default:
      return null;
  }
}
