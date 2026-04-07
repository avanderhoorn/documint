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
import type { EditorSelection, SelectionTarget } from "../selection";

// Block-level document mutations: replace, update, and splice blocks within
// the document tree.

export type EditorMutationSelection = EditorSelection | SelectionTarget | null;

export type EditorDocumentMutation = {
  document: Document;
  selection: EditorMutationSelection;
};

export function replaceEditorRoot(
  documentIndex: DocumentIndex,
  rootIndex: number,
  replacement: Block,
  selection: EditorMutationSelection = null,
): EditorDocumentMutation {
  return replaceEditorRootRange(documentIndex, rootIndex, 1, [replacement], selection);
}

export function replaceEditorRootRange(
  documentIndex: DocumentIndex,
  rootIndex: number,
  count: number,
  replacements: Block[],
  selection: EditorMutationSelection = null,
): EditorDocumentMutation {
  return {
    document: spliceDocument(documentIndex.document, rootIndex, count, replacements),
    selection,
  };
}

export function replaceEditorBlock(
  documentIndex: DocumentIndex,
  targetBlockId: string,
  replacement: Block,
  selection: EditorMutationSelection = null,
) {
  return updateEditorBlock(documentIndex, targetBlockId, () => replacement, selection);
}

export function updateEditorBlock(
  documentIndex: DocumentIndex,
  targetBlockId: string,
  update: (block: Block) => Block | null,
  selection: EditorMutationSelection = null,
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
