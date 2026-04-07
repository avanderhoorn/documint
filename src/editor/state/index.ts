export {
  createDocumentIndex,
  buildEditorRoots,
  createDocumentFromIndex,
  createEditorRoot,
  rebuildEditorRoot,
  replaceIndexedDocument,
  spliceDocumentIndex,
} from "./index/build";
export type {
  EditorInline,
  EditorBlock,
  EditorListItemMarker,
  DocumentIndex,
  EditorRegion,
  RuntimeImageAttributes,
  RuntimeLinkAttributes,
} from "./index/types";

export {
  createDescendantPrimaryRegionTarget,
  createRootPrimaryRegionTarget,
  createTableCellTarget,
  getSelectionContext,
  isSelectionCollapsed,
  normalizeSelection,
  resolveRegion,
  resolveRegionByPath,
  resolveTableCellRegion,
  resolveSelectionTarget,
} from "./selection";
export type {
  EditorSelection,
  EditorSelectionPoint,
  NormalizedEditorSelection,
  RegionRangePathSelectionTarget,
  SelectionBlockContext,
  SelectionContext,
  SelectionSpanContext,
  SelectionTarget,
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
} from "./index/actions/inline";
export type { InlineCommandReplacement, InlineCommandTarget } from "./index/actions/inline";

export type { EditorAction, ActionSelection, EditorStateAction } from "./index/types";

export {
  resolveBlockStructuralBackspace,
  resolveBlockquoteTextBlockSplit,
  resolveBlockquoteWrap,
  resolveCodeLineBreak,
  resolveHeadingDepthShift,
  resolveStructuralBlockquoteSplit,
  resolveTextBlockSplit,
} from "./index/actions/block";
export { resolveTextInputRule } from "./index/actions/input-rules";
export {
  createInsertedListItem,
  replaceListItemLeadingParagraphText,
  resolveListItemContext,
  resolveListItemPath,
} from "./index/context";
export type { ListItemContext } from "./index/context";
export {
  resolveListItemDedent,
  resolveListItemIndent,
  resolveListItemMove,
  resolveListItemSplit,
  resolveListStructuralBackspace,
  resolveStructuralListBlockSplit,
} from "./index/actions/list";
export {
  resolveTableCellLineBreak,
  resolveTableColumnDeletion,
  resolveTableColumnInsertion,
  resolveTableDeletion,
  resolveTableInsertion,
  resolveTableRowDeletion,
  resolveTableRowInsertion,
  resolveTableSelectionMove,
} from "./index/actions/table";
export {
  replaceEditorBlock,
  replaceEditorRoot,
  replaceEditorRootRange,
  replaceSelection,
  updateEditorBlock,
} from "./index/reducer";
export type { DocumentReduction, ReductionSelection } from "./index/reducer";

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
  setSelectionPoint,
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
} from "./index/context";
export type {
  BlockCommandContext,
  BlockquoteContext,
  BlockquoteTextBlockContext,
  CodeBlockCommandContext,
  RootTextBlockContext,
  TableCellContext,
} from "./index/context";

export * from "./commands";
