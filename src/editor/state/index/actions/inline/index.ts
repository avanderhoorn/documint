export {
  type InlineCommandTarget,
  type InlineCommandReplacement,
  resolveInlineRegionTarget,
  resolveInlineRangeReplacement,
  replaceInlineRange,
  resolveInlineCommandTarget,
} from "./target";

export { toggleInlineMarkTarget, resolveInlineCommandMarks } from "./marks";
export { toggleInlineCodeTarget } from "./code";
export { replaceExactInlineLinkRange, replaceExactInlineLinkTarget } from "./links";
export { insertInlineLineBreakTarget } from "./breaks";
