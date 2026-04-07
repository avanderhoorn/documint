export {
  createDocumentIndex,
  buildEditorRoots,
  createDocumentFromIndex,
  createEditorRoot,
  rebuildEditorRoot,
  replaceIndexedDocument,
  spliceDocumentIndex,
} from "./build";
export type {
  EditorInline,
  EditorBlock,
  EditorListItemMarker,
  DocumentIndex,
  EditorRegion,
  RuntimeImageAttributes,
  RuntimeLinkAttributes,
} from "./types";

export {
  createDescendantPrimaryRegionTarget,
  createRootPrimaryRegionTarget,
  createTableCellTarget,
  normalizeSelection,
  resolveRegion,
  resolveRegionByPath,
  resolveTableCellRegion,
  resolveSelectionTarget,
} from "./selection";
export type {
  EditorSelection,
  EditorSelectionPoint,
  SelectionTarget,
  NormalizedEditorSelection,
  RegionRangePathSelectionTarget,
} from "./selection";

export {
  insertInlineLineBreakTarget,
  replaceExactInlineLinkRange,
  replaceExactInlineLinkTarget,
  replaceInlineRange,
  resolveInlineRegionTarget,
  resolveInlineRangeReplacement,
  resolveInlineCommandMarks,
  resolveInlineCommandTarget,
  toggleInlineCodeTarget,
  toggleInlineMarkTarget,
} from "./commands/inline";
export type { InlineCommandReplacement, InlineCommandTarget } from "./commands/inline";

export type { EditorTransaction, TransactionSelection } from "./types";

export {
  resolveBlockStructuralBackspace,
  resolveBlockquoteTextBlockSplit,
  resolveBlockquoteWrap,
  resolveCodeLineBreak,
  resolveHeadingDepthShift,
  resolveStructuralBlockquoteSplit,
  resolveTextBlockSplit,
} from "./commands/block";
export { resolveTextInputRule } from "./commands/input-rules";
export {
  createInsertedListItem,
  replaceListItemLeadingParagraphText,
  resolveListItemContext,
  resolveListItemPath,
} from "./context";
export type { ListItemContext } from "./context";
export {
  resolveListItemDedent,
  resolveListItemIndent,
  resolveListItemMove,
  resolveListItemSplit,
  resolveListStructuralBackspace,
  resolveStructuralListBlockSplit,
} from "./commands/list";
export {
  resolveTableCellLineBreak,
  resolveTableColumnDeletion,
  resolveTableColumnInsertion,
  resolveTableDeletion,
  resolveTableInsertion,
  resolveTableRowDeletion,
  resolveTableRowInsertion,
  resolveTableSelectionMove,
} from "./commands/table";
export {
  replaceEditorBlock,
  replaceEditorRoot,
  replaceEditorRootRange,
  replaceText,
  updateEditorBlock,
} from "./mutations";
export type { EditorDocumentMutation, EditorMutationSelection } from "./mutations";

export {
  addActiveBlockFlashAnimation,
  addDeletedTextFadeAnimation,
  addInsertedTextHighlightAnimation,
  addListMarkerPopAnimation,
  addPunctuationPulseAnimation,
} from "./animations";
export type {
  ActiveBlockFlashAnimation,
  DeletedTextFadeAnimation,
  EditorAnimation,
  InsertedTextHighlightAnimation,
  ListMarkerPopAnimation,
  PunctuationPulseAnimation,
} from "./animations";

export {
  createDocumentFromEditorState,
  createEditorState,
  redoEditorState,
  setSelection,
  spliceEditorCommentThreads,
  undoEditorState,
} from "./state";
export type { EditorState } from "./state";

export {
  findAncestorBlockEntry,
  findRootIndex,
  parseBlockChildIndices,
  resolveBlockById,
  resolveBlockCommandContext,
  resolveBlockquoteContext,
  resolveBlockquoteTextBlockContext,
  resolveRootTextBlockContext,
  resolveTableCellContext,
} from "./context";
export type {
  BlockCommandContext,
  BlockquoteContext,
  BlockquoteTextBlockContext,
  CodeBlockCommandContext,
  RootTextBlockContext,
  TableCellContext,
} from "./context";

export * from "./commands";
