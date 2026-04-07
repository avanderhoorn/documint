// Block-level mutations. Replace, update, or splice blocks within
// the document tree by ID or root index. These are structural
// operations where the caller provides the replacement block(s).

import {
  createBlockquoteBlock,
  rebuildListBlock,
  rebuildListItemBlock,
  spliceDocument,
  type Block,
  type Document,
  type ListItemBlock,
} from "@/document";
import type { DocumentIndex } from "../types";
import type { EditorSelection, SelectionTarget } from "../../selection";

/* Types */

export type ReductionSelection = EditorSelection | SelectionTarget | null;

export type DocumentReduction = {
  document: Document;
  selection: ReductionSelection;
};

/* Root-level mutations */

export function replaceEditorRoot(
  documentIndex: DocumentIndex,
  rootIndex: number,
  replacement: Block,
  selection: ReductionSelection = null,
): DocumentReduction {
  return replaceEditorRootRange(documentIndex, rootIndex, 1, [replacement], selection);
}

export function replaceEditorRootRange(
  documentIndex: DocumentIndex,
  rootIndex: number,
  count: number,
  replacements: Block[],
  selection: ReductionSelection = null,
): DocumentReduction {
  return {
    document: spliceDocument(documentIndex.document, rootIndex, count, replacements),
    selection,
  };
}

/* Block-level mutations */

export function replaceEditorBlock(
  documentIndex: DocumentIndex,
  targetBlockId: string,
  replacement: Block,
  selection: ReductionSelection = null,
) {
  return updateEditorBlock(documentIndex, targetBlockId, () => replacement, selection);
}

export function updateEditorBlock(
  documentIndex: DocumentIndex,
  targetBlockId: string,
  update: (block: Block) => Block | null,
  selection: ReductionSelection = null,
) {
  const blockEntry = documentIndex.blockIndex.get(targetBlockId);

  if (!blockEntry) {
    return null;
  }

  const rootBlock = documentIndex.document.blocks[blockEntry.rootIndex];

  if (!rootBlock) {
    return null;
  }

  const nextRootBlock = updateBlockInTree(rootBlock, targetBlockId, update);

  return nextRootBlock
    ? replaceEditorRootRange(documentIndex, blockEntry.rootIndex, 1, [nextRootBlock], selection)
    : null;
}

/* Tree traversal */

function updateBlockInTree(
  block: Block,
  targetBlockId: string,
  update: (block: Block) => Block | null,
): Block | null {
  if (block.id === targetBlockId) {
    return update(block);
  }

  switch (block.type) {
    case "blockquote": {
      const nextChildren = updateBlockInTreeChildren(block.children, targetBlockId, update);
      return nextChildren ? createBlockquoteBlock({ children: nextChildren }) : null;
    }
    case "listItem": {
      const nextChildren = updateBlockInTreeChildren(block.children, targetBlockId, update);
      return nextChildren ? rebuildListItemBlock(block, nextChildren) : null;
    }
    case "list": {
      const nextItems = updateBlockInTreeChildren(block.items, targetBlockId, update) as
        | ListItemBlock[]
        | null;
      return nextItems ? rebuildListBlock(block, nextItems) : null;
    }
    default:
      return null;
  }
}

function updateBlockInTreeChildren(
  blocks: Block[],
  targetBlockId: string,
  update: (block: Block) => Block | null,
) {
  let didChange = false;

  const nextBlocks = blocks.map((block) => {
    const nextBlock = updateBlockInTree(block, targetBlockId, update);

    if (!nextBlock) {
      return block;
    }

    didChange = true;
    return nextBlock;
  });

  return didChange ? nextBlocks : null;
}
