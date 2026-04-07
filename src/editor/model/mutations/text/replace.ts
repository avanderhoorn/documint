import {
  createTableCell as createDocumentTableCell,
  rebuildCodeBlock,
  rebuildTableBlock,
  rebuildTextBlock,
  rebuildRawBlock,
  type Block,
  type TableCell,
} from "@/document";
import { updateCommentThreadsForRegionEdit } from "../../../annotations";
import { replaceIndexedDocument, spliceDocumentIndex } from "../../build";
import type { DocumentIndex, EditorRegion } from "../../types";
import { updateEditorBlock } from "../block";
import { editorInlinesToDocumentInlines, replaceEditorInlines } from "./inlines";
import {
  normalizeSelection,
  resolveRegion,
  resolveRegionByPath,
  type EditorSelection,
} from "../../selection";

// Text replacement within editor regions. Orchestrates inline splicing,
// incremental model rebuilding, and comment thread updates.

export function replaceText(documentIndex: DocumentIndex, selection: EditorSelection, text: string) {
  const normalized = normalizeSelection(documentIndex, selection);

  if (normalized.start.regionId !== normalized.end.regionId) {
    throw new Error("Cross-region text replacement is not supported yet.");
  }

  const region = resolveRegion(documentIndex, normalized.start.regionId);

  if (!region) {
    throw new Error(`Unknown region: ${normalized.start.regionId}`);
  }

  const mutation = updateEditorBlock(documentIndex, region.blockId, (block) =>
    replaceBlockRegionText(block, region, normalized.start.offset, normalized.end.offset, text),
  );

  if (!mutation) {
    throw new Error(`Failed to replace block for canvas region: ${region.id}`);
  }

  const nextDocument = mutation.document;
  const nextDocumentIndex = spliceDocumentIndex(documentIndex, nextDocument, region.rootIndex, 1);

  const finalizedDocumentIndex =
    documentIndex.document.comments.length === 0
      ? nextDocumentIndex
      : finalizeCommentsAfterEdit(
          documentIndex,
          nextDocumentIndex,
          region,
          normalized.start.offset,
          normalized.end.offset,
          text,
        );

  const nextRegion = resolveRegionByPath(finalizedDocumentIndex, region.path);

  if (!nextRegion) {
    throw new Error(`Failed to remap region after replacement: ${region.path}`);
  }

  const nextOffset = normalized.start.offset + text.length;

  return {
    documentIndex: finalizedDocumentIndex,
    selection: {
      anchor: {
        regionId: nextRegion.id,
        offset: nextOffset,
      },
      focus: {
        regionId: nextRegion.id,
        offset: nextOffset,
      },
    } satisfies EditorSelection,
  };
}

function finalizeCommentsAfterEdit(
  previousDocumentIndex: DocumentIndex,
  nextDocumentIndex: DocumentIndex,
  region: EditorRegion,
  startOffset: number,
  endOffset: number,
  text: string,
): DocumentIndex {
  const nextComments = updateCommentThreadsForRegionEdit(
    previousDocumentIndex,
    nextDocumentIndex,
    region,
    startOffset,
    endOffset,
    text,
  );

  return nextComments === nextDocumentIndex.document.comments
    ? nextDocumentIndex
    : replaceIndexedDocument(nextDocumentIndex, {
        ...nextDocumentIndex.document,
        comments: nextComments,
      });
}

function replaceBlockRegionText(
  block: Block,
  region: EditorRegion,
  startOffset: number,
  endOffset: number,
  replacementText: string,
): Block {
  switch (block.type) {
    case "heading":
      return replaceInlineBlockText(block, region, startOffset, endOffset, replacementText);
    case "paragraph":
      return replaceInlineBlockText(block, region, startOffset, endOffset, replacementText);
    case "code":
      return rebuildCodeBlock(
        block,
        replaceDocumentEditorBlockText(region, startOffset, endOffset, replacementText),
      );
    case "table":
      return replaceTableCellText(block, region, startOffset, endOffset, replacementText);
    case "unsupported":
      return rebuildRawBlock(
        block,
        replaceDocumentEditorBlockText(region, startOffset, endOffset, replacementText),
      );
    default:
      throw new Error(`Canvas text replacement is not supported for block type: ${block.type}`);
  }
}

function replaceTableCellText(
  block: Extract<Block, { type: "table" }>,
  region: EditorRegion,
  startOffset: number,
  endOffset: number,
  replacementText: string,
): Extract<Block, { type: "table" }> {
  const rowIndex = region.tableCellPosition?.rowIndex;
  const cellIndex = region.tableCellPosition?.cellIndex;

  if (rowIndex === undefined || cellIndex === undefined) {
    throw new Error(`Unable to resolve table cell position for region: ${region.id}`);
  }

  const nextInlines = replaceEditorInlines(region.inlines, startOffset, endOffset, replacementText);
  const nextChildren = editorInlinesToDocumentInlines(nextInlines);
  const rows = block.rows.map((row, currentRowIndex) => {
    if (currentRowIndex !== rowIndex) {
      return row;
    }

    const cells = row.cells.map<TableCell>((cell, currentCellIndex) => {
      if (currentCellIndex !== cellIndex) {
        return cell;
      }

      return createDocumentTableCell({
        children: nextChildren,
      });
    });

    return {
      ...row,
      cells,
    };
  });

  return rebuildTableBlock(block, rows);
}

function replaceInlineBlockText(
  block: Extract<Block, { type: "heading" | "paragraph" }>,
  region: EditorRegion,
  startOffset: number,
  endOffset: number,
  replacementText: string,
): Extract<Block, { type: "heading" | "paragraph" }> {
  const nextInlines = replaceEditorInlines(region.inlines, startOffset, endOffset, replacementText);
  const nextChildren = editorInlinesToDocumentInlines(nextInlines);

  return rebuildTextBlock(block, nextChildren);
}

function replaceDocumentEditorBlockText(
  region: EditorRegion,
  startOffset: number,
  endOffset: number,
  replacementText: string,
) {
  return replaceEditorInlines(region.inlines, startOffset, endOffset, replacementText)
    .map((run) => run.text)
    .join("");
}
