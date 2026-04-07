// Document reducer. Dispatches EditorActions to either block-level
// mutations (block.ts) or selection-based mutations (selection.ts),
// producing a new document. Does not manage history, selection state,
// or UI concerns — that's the state machine's job (state.ts).

import type { Document } from "@/document";
import type { DocumentIndex, EditorAction } from "../types";
import type { EditorSelection, SelectionTarget } from "../../selection";
import { replaceEditorBlock, replaceEditorRoot, replaceEditorRootRange } from "./block";
import { replaceSelection } from "./selection";

/* Types */

export type ReducerResult = {
  document: Document;
  documentIndex?: DocumentIndex | null;
  selection: EditorSelection | SelectionTarget | null;
};

/* Dispatch */

export function applyAction(
  documentIndex: DocumentIndex,
  action: EditorAction,
): ReducerResult | null {
  switch (action.kind) {
    case "replace-block":
      return replaceEditorBlock(
        documentIndex,
        action.blockId,
        action.block,
        action.selection ?? null,
      );
    case "replace-root":
      return replaceEditorRoot(
        documentIndex,
        action.rootIndex,
        action.block,
        action.selection ?? null,
      );
    case "replace-root-range":
      return replaceEditorRootRange(
        documentIndex,
        action.rootIndex,
        action.count,
        action.replacements,
        action.selection ?? null,
      );
    case "replace-selection": {
      const result = replaceSelection(documentIndex, action.selection, action.text);

      return {
        document: result.documentIndex.document,
        documentIndex: result.documentIndex,
        selection: result.selection,
      };
    }
  }

  return null;
}

/* Re-exports */

export {
  replaceEditorBlock,
  replaceEditorRoot,
  replaceEditorRootRange,
  updateEditorBlock,
} from "./block";
export type { DocumentReduction, ReductionSelection } from "./block";
export { replaceSelection } from "./selection";
