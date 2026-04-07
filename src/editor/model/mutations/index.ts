// Applies an EditorTransaction to the current DocumentIndex, producing a
// mutated document. Does not manage history, selection, or UI concerns —
// that's the state machine's job.
import type { Document } from "@/document";
import type { DocumentIndex, EditorTransaction } from "../types";
import type { EditorSelection, SelectionTarget } from "../selection";
import { replaceEditorBlock, replaceEditorRoot, replaceEditorRootRange } from "./block";
import { replaceText } from "./text/replace";

export type MutationResult = {
  document: Document;
  documentIndex?: DocumentIndex | null;
  selection: EditorSelection | SelectionTarget | null;
};

export function applyDocumentMutation(
  documentIndex: DocumentIndex,
  transaction: EditorTransaction,
): MutationResult | null {
  switch (transaction.kind) {
    case "replace-block":
      return replaceEditorBlock(
        documentIndex,
        transaction.blockId,
        transaction.block,
        transaction.selection ?? null,
      );
    case "replace-root":
      return replaceEditorRoot(
        documentIndex,
        transaction.rootIndex,
        transaction.block,
        transaction.selection ?? null,
      );
    case "replace-root-range":
      return replaceEditorRootRange(
        documentIndex,
        transaction.rootIndex,
        transaction.count,
        transaction.replacements,
        transaction.selection ?? null,
      );
    case "replace-selection-text": {
      const result = replaceText(documentIndex, transaction.selection, transaction.text);

      return {
        document: result.documentIndex.document,
        documentIndex: result.documentIndex,
        selection: result.selection,
      };
    }
  }

  return null;
}

// Re-export public mutation types and functions for the barrel.
export {
  replaceEditorBlock,
  replaceEditorRoot,
  replaceEditorRootRange,
  updateEditorBlock,
} from "./block";
export type { EditorDocumentMutation, EditorMutationSelection } from "./block";
export { replaceText } from "./text/replace";
