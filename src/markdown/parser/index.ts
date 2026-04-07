/**
 * Orchestrates block parsing and trailing metadata extraction for markdown.
 */

import type { Document } from "@/document";
import { createDocument } from "@/document";
import { lineFeed, type MarkdownOptions } from "../shared";
import { parseBlocks } from "./blocks";
import { extractCommentDirective } from "./comments";

export type MarkdownLineCursor = {
  index: number;
  lines: string[];
};

export function parseMarkdown(source: string, options: MarkdownOptions = {}): Document {
  const lines = source.replace(/\r\n/g, lineFeed).split(lineFeed);
  const cursor: MarkdownLineCursor = {
    index: 0,
    lines,
  };

  const blocks = parseBlocks(cursor, 0, options);
  const { comments, blocks: contentBlocks } = extractCommentDirective(blocks);

  return createDocument(contentBlocks, comments);
}
