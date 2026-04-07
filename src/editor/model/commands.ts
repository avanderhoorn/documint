// Editor commands: composable EditorState → EditorState | null functions.
// Each command resolves a transaction, commits it, and applies any
// side-effects (animations). These are the public API consumed by tests,
// benchmarks, and the Editor facade.
//
// Structural commands (insertLineBreak, deleteBackward, indent, dedent) use
// context-first dispatch: they resolve the block command context once, then
// switch on context.kind to call the appropriate resolver.
import {
  addDeletedTextFadeAnimation,
  addInsertedTextHighlightAnimation,
  addListMarkerPopAnimation,
  addPunctuationPulseAnimation,
  normalizeSelection,
  redoEditorState,
  resolveBlockById,
  resolveRegion,
  setSelection,
  type EditorTransaction,
  type EditorState,
  undoEditorState,
} from "./index";
import {
  type InlineCommandReplacement,
  replaceExactInlineLinkRange,
  replaceInlineRange,
  type InlineCommandTarget,
  toggleInlineCodeTarget,
  toggleInlineMarkTarget,
} from "./commands/inline";
import { resolveTextInputRule } from "./commands/input-rules";
import {
  resolveListItemDedent,
  resolveListItemIndent,
  resolveListItemMove,
  resolveListItemSplit,
  resolveListStructuralBackspace,
  resolveStructuralListBlockSplit,
} from "./commands/list";
import { commitTransaction } from "./state";
import {
  resolveBlockStructuralBackspace,
  resolveCodeLineBreak,
  resolveHeadingDepthShift,
  resolveStructuralBlockquoteSplit,
  resolveTextBlockSplit,
} from "./commands/block";
import {
  resolveTableCellLineBreak,
  resolveTableColumnDeletion,
  resolveTableColumnInsertion,
  resolveTableDeletion,
  resolveTableInsertion,
  resolveTableRowDeletion,
  resolveTableRowInsertion,
  resolveTableSelectionMove,
} from "./commands/table";
import { resolveBlockCommandContext } from "./context";

// --- Core editing commands ---

export function insertText(state: EditorState, text: string) {
  const operation = resolveTextInputRule(state.documentIndex, state.selection, text);
  let nextState = commitTransaction(state, operation);

  if (!nextState) {
    return null;
  }

  if (operation?.kind === "replace-selection-text" && text.length > 0) {
    nextState = addInsertedTextHighlightAnimation(nextState, text.length);
  }

  if (text === ".") {
    nextState = addPunctuationPulseAnimation(nextState);
  }

  return nextState;
}

export function insertLineBreak(state: EditorState) {
  const ctx = resolveBlockCommandContext(state.documentIndex, state.selection);

  switch (ctx.kind) {
    case "code":
      return commitTransaction(state, resolveCodeLineBreak(state.documentIndex, state.selection));
    case "tableCell":
      return commitTransaction(
        state,
        resolveTableCellLineBreak(state.documentIndex, state.selection),
      );
    case "listItem": {
      const transaction = resolveStructuralListBlockSplit(state.documentIndex, state.selection);
      return maybeAnimateListItemInsertion({
        state:
          commitTransaction(state, transaction) ??
          commitTransaction(state, resolveTextBlockSplit(state.documentIndex, state.selection)),
        transaction,
      });
    }
    case "blockquoteTextBlock":
      return (
        commitTransaction(
          state,
          resolveStructuralBlockquoteSplit(state.documentIndex, state.selection),
        ) ?? commitTransaction(state, resolveTextBlockSplit(state.documentIndex, state.selection))
      );
    case "rootTextBlock":
      return commitTransaction(state, resolveTextBlockSplit(state.documentIndex, state.selection));
    case "unsupported":
      return null;
  }
}

export function deleteBackward(state: EditorState) {
  if (hasExpandedSingleRegionSelection(state)) {
    return deleteSelectionText(state);
  }

  const characterDelete = deleteCharacterBackward(state);

  if (characterDelete) {
    return characterDelete;
  }

  const selection = normalizeSelection(state.documentIndex, state.selection);

  if (
    selection.start.regionId !== selection.end.regionId ||
    selection.start.offset !== 0 ||
    selection.end.offset !== 0
  ) {
    return null;
  }

  const ctx = resolveBlockCommandContext(state.documentIndex, state.selection);

  switch (ctx.kind) {
    case "listItem":
      return commitTransaction(
        state,
        resolveListStructuralBackspace(state.documentIndex, state.selection),
      );
    case "blockquoteTextBlock":
    case "rootTextBlock":
      return commitTransaction(
        state,
        resolveBlockStructuralBackspace(state.documentIndex, state.selection),
      );
    default:
      return null;
  }
}

export function deleteForward(state: EditorState) {
  if (hasExpandedSingleRegionSelection(state)) {
    return deleteSelectionText(state);
  }

  return deleteCharacterForward(state);
}

// --- Selection text operations ---

export function replaceSelectionText(state: EditorState, text: string) {
  return commitTransaction(state, {
    kind: "replace-selection-text",
    selection: state.selection,
    text,
  });
}

export function insertSelectionText(state: EditorState, text: string) {
  const nextState = replaceSelectionText(state, text);

  return text.length > 0 ? addInsertedTextHighlightAnimation(nextState, text.length) : nextState;
}

export function deleteSelectionText(state: EditorState) {
  return replaceSelectionText(state, "");
}

// --- Structural operations ---

export function indent(state: EditorState) {
  const ctx = resolveBlockCommandContext(state.documentIndex, state.selection);

  switch (ctx.kind) {
    case "tableCell":
      return commitTransaction(
        state,
        resolveTableSelectionMove(state.documentIndex, state.selection, 1),
      );
    case "rootTextBlock":
      return commitTransaction(
        state,
        resolveHeadingDepthShift(state.documentIndex, state.selection, 1),
      );
    case "listItem":
      return indentListItem(state);
    default:
      return null;
  }
}

export function dedent(state: EditorState) {
  const ctx = resolveBlockCommandContext(state.documentIndex, state.selection);

  switch (ctx.kind) {
    case "tableCell":
      return commitTransaction(
        state,
        resolveTableSelectionMove(state.documentIndex, state.selection, -1),
      );
    case "rootTextBlock":
      return commitTransaction(
        state,
        resolveHeadingDepthShift(state.documentIndex, state.selection, -1),
      );
    case "listItem":
      return dedentListItem(state);
    default:
      return null;
  }
}

// --- List operations ---

export function splitSelectionListItem(state: EditorState) {
  return commitTransaction(state, resolveListItemSplit(state.documentIndex, state.selection));
}

export function indentListItem(state: EditorState) {
  return commitTransaction(state, resolveListItemIndent(state.documentIndex, state.selection));
}

export function dedentListItem(state: EditorState) {
  return commitTransaction(state, resolveListItemDedent(state.documentIndex, state.selection));
}

export function moveListItemUp(state: EditorState) {
  return commitTransaction(state, resolveListItemMove(state.documentIndex, state.selection, -1));
}

export function moveListItemDown(state: EditorState) {
  return commitTransaction(state, resolveListItemMove(state.documentIndex, state.selection, 1));
}

// --- Table operations ---

export function insertTable(state: EditorState, columnCount: number) {
  return commitTransaction(
    state,
    resolveTableInsertion(state.documentIndex, state.selection, columnCount),
  );
}

export function insertTableColumn(state: EditorState, direction: "left" | "right") {
  return commitTransaction(
    state,
    resolveTableColumnInsertion(state.documentIndex, state.selection, direction),
  );
}

export function deleteTableColumn(state: EditorState) {
  return commitTransaction(state, resolveTableColumnDeletion(state.documentIndex, state.selection));
}

export function insertTableRow(state: EditorState, direction: "above" | "below") {
  return commitTransaction(
    state,
    resolveTableRowInsertion(state.documentIndex, state.selection, direction),
  );
}

export function deleteTableRow(state: EditorState) {
  return commitTransaction(state, resolveTableRowDeletion(state.documentIndex, state.selection));
}

export function deleteTable(state: EditorState) {
  return commitTransaction(state, resolveTableDeletion(state.documentIndex, state.selection));
}

// --- Inline formatting ---

export function toggleMark(
  state: EditorState,
  mark: "italic" | "bold" | "strikethrough" | "underline",
) {
  return applyInlineSelectionEdit(state, (target, startOffset, endOffset) =>
    toggleInlineMarkTarget(target, startOffset, endOffset, mark),
  );
}

export function toggleInlineCode(state: EditorState) {
  return applyInlineSelectionEdit(state, (target, startOffset, endOffset) =>
    toggleInlineCodeTarget(target, startOffset, endOffset),
  );
}

export function toggleBold(state: EditorState) {
  return toggleMark(state, "bold");
}

export function toggleItalic(state: EditorState) {
  return toggleMark(state, "italic");
}

export function toggleStrikethrough(state: EditorState) {
  return toggleMark(state, "strikethrough");
}

export function toggleUnderline(state: EditorState) {
  return toggleMark(state, "underline");
}

// --- Links ---

export function updateInlineLink(
  state: EditorState,
  regionId: string,
  startOffset: number,
  endOffset: number,
  url: string,
) {
  return commitTransaction(
    state,
    replaceExactInlineLinkRange(state.documentIndex, regionId, startOffset, endOffset, url),
  );
}

export function removeInlineLink(
  state: EditorState,
  regionId: string,
  startOffset: number,
  endOffset: number,
) {
  return commitTransaction(
    state,
    replaceExactInlineLinkRange(state.documentIndex, regionId, startOffset, endOffset, null),
  );
}

// --- Task items ---

export function toggleTaskItem(state: EditorState, listItemId: string) {
  const block = resolveBlockById(state.documentIndex, listItemId);

  if (!block || block.type !== "listItem" || typeof block.checked !== "boolean") {
    return null;
  }

  return commitTransaction(state, {
    kind: "replace-block",
    block: { ...block, checked: !block.checked },
    blockId: listItemId,
  });
}

// --- History ---

export function undo(state: EditorState) {
  return undoEditorState(state);
}

export function redo(state: EditorState) {
  return redoEditorState(state);
}

// --- Private helpers ---

function maybeAnimateListItemInsertion(result: {
  state: EditorState | null;
  transaction: EditorTransaction | null;
}): EditorState | null {
  if (
    !result.state ||
    !result.transaction ||
    result.transaction.kind !== "replace-block" ||
    !result.transaction.listItemInsertedPath
  ) {
    return result.state;
  }

  return addListMarkerPopAnimation(result.state, result.transaction.listItemInsertedPath);
}

function applyInlineSelectionEdit(
  state: EditorState,
  applyTargetEdit: (
    target: InlineCommandTarget,
    startOffset: number,
    endOffset: number,
  ) => InlineCommandReplacement | null,
) {
  const selection = normalizeSelection(state.documentIndex, state.selection);

  if (
    selection.start.regionId !== selection.end.regionId ||
    selection.start.offset === selection.end.offset
  ) {
    return null;
  }

  return commitTransaction(
    state,
    replaceInlineRange(
      state.documentIndex,
      selection.start.regionId,
      selection.start.offset,
      selection.end.offset,
      applyTargetEdit,
    ),
  );
}

function hasExpandedSingleRegionSelection(state: EditorState) {
  const normalized = normalizeSelection(state.documentIndex, state.selection);

  return (
    normalized.start.regionId === normalized.end.regionId &&
    normalized.start.offset !== normalized.end.offset
  );
}

function deleteCharacterBackward(state: EditorState) {
  return deleteCollapsedCharacter(state, "backward");
}

function deleteCharacterForward(state: EditorState) {
  return deleteCollapsedCharacter(state, "forward");
}

function deleteCollapsedCharacter(state: EditorState, direction: "backward" | "forward") {
  if (
    state.selection.anchor.regionId !== state.selection.focus.regionId ||
    state.selection.anchor.offset !== state.selection.focus.offset
  ) {
    return null;
  }

  const region = resolveRegion(state.documentIndex, state.selection.focus.regionId);

  if (!region) {
    return null;
  }

  if (direction === "forward" && state.selection.focus.offset >= region.text.length) {
    return null;
  }

  const startOffset =
    direction === "backward"
      ? previousGraphemeOffset(region.text, state.selection.focus.offset)
      : state.selection.focus.offset;
  const endOffset =
    direction === "backward"
      ? state.selection.focus.offset
      : nextGraphemeOffset(region.text, state.selection.focus.offset);

  if (startOffset === endOffset) {
    return null;
  }

  const nextState = replaceSelectionText(
    setSelection(state, {
      anchor: {
        regionId: region.id,
        offset: startOffset,
      },
      focus: {
        regionId: region.id,
        offset: endOffset,
      },
    }),
    "",
  );

  return maybeAddDeletedTextFadeAnimation(state, nextState, startOffset, endOffset);
}

function maybeAddDeletedTextFadeAnimation(
  previousState: EditorState,
  nextState: EditorState,
  startOffset: number,
  endOffset: number,
) {
  const deletedTextFade = resolveDeletedTextFadeAnimation(previousState, startOffset, endOffset);

  return deletedTextFade ? addDeletedTextFadeAnimation(nextState, deletedTextFade) : nextState;
}

function resolveDeletedTextFadeAnimation(
  state: EditorState,
  startOffset: number,
  endOffset: number,
) {
  const region = state.documentIndex.regionIndex.get(state.selection.focus.regionId);

  if (!region) {
    return null;
  }

  const deletedText = region.text.slice(startOffset, endOffset);

  if (deletedText.length === 0) {
    return null;
  }

  const deletedInline = region.inlines.find(
    (inline) =>
      inline.start <= startOffset &&
      inline.end >= endOffset &&
      inline.kind === "text" &&
      inline.link === null &&
      inline.marks.length === 0,
  );

  if (!deletedInline) {
    return null;
  }

  return {
    regionPath: region.path,
    startOffset,
    text: deletedText,
  };
}

function previousGraphemeOffset(text: string, offset: number) {
  const slice = Array.from(text.slice(0, offset));

  if (slice.length === 0) {
    return 0;
  }

  return offset - slice.at(-1)!.length;
}

function nextGraphemeOffset(text: string, offset: number) {
  const next = Array.from(text.slice(offset))[0];

  return next ? offset + next.length : text.length;
}
