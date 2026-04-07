/**
 * Owns line-oriented block parsing for the Documint markdown dialect.
 */

import {
  createBlockquoteBlock,
  createCodeBlock,
  createDirectiveBlock,
  createDividerBlock,
  createHeadingBlock,
  createListBlock,
  createListItemBlock,
  createParagraphBlock,
  createRawBlock,
  type Block,
  type ListItemBlock,
} from "@/document";
import {
  blockquoteMarker,
  containerDirectiveClosingMarker,
  containerDirectiveOpening,
  fencedCodeMarker,
  lineFeed,
  type MarkdownOptions,
} from "../shared";
import type { MarkdownLineCursor } from "./index";
import { parseInlineMarkdown } from "./inline";
import { looksLikeAlignmentRow, readTable } from "./tables";

const maxContainerIndentSlack = 3;

const orderedListMarker = /^\d+\.$/;
const taskListMarker = /^\[( |x|X)\](?:\s|$)/;

const fencedCodeOpening = /^```([^\s`]*)?(?:\s+(.*))?$/;

const leafDirectiveOpening = /^::(?!:)[A-Za-z][-\w]*/;

const atxHeading = /^(#{1,6})\s+(.*)$/;
const atxHeadingClosingSequence = /\s+#+\s*$/u;

const listMarker = /^(\s*)([-+*]|\d+\.)(?:\s+(.*)|\s*)$/;

const thematicBreakAsterisk = /^(\*\s*){3,}$/;
const thematicBreakHyphen = /^(-\s*){3,}$/;
const thematicBreakUnderscore = /^(_\s*){3,}$/;

type ParsedListMarker = {
  checked: boolean | null;
  content: string;
  contentIndent: number;
  ordered: boolean;
  start: number | null;
};

export function parseBlocks(
  cursor: MarkdownLineCursor,
  baseIndent: number,
  options: MarkdownOptions,
) {
  const blocks: Block[] = [];

  while (cursor.index < cursor.lines.length) {
    const line = currentLine(cursor);
    if (cursor.index === cursor.lines.length - 1 && line === "") {
      break;
    }

    if (isBlankLine(line)) {
      cursor.index += 1;
      continue;
    }

    const indent = countIndent(line);
    if (indent > baseIndent + maxContainerIndentSlack) {
      break;
    }

    const block = readNextBlock(cursor, baseIndent, options);
    if (!block) {
      break;
    }

    blocks.push(block);
  }

  return blocks;
}

function readNextBlock(cursor: MarkdownLineCursor, baseIndent: number, options: MarkdownOptions) {
  return (
    readBlockquote(cursor, baseIndent, options) ??
    readFencedCode(cursor, baseIndent) ??
    readContainerDirective(cursor, baseIndent) ??
    readLeafDirective(cursor, baseIndent) ??
    readHeading(cursor, baseIndent) ??
    readThematicBreak(cursor, baseIndent) ??
    readTable(cursor, baseIndent) ??
    readList(cursor, baseIndent, options) ??
    readRawHtmlBlock(cursor, baseIndent) ??
    readParagraph(cursor, baseIndent)
  );
}

function readBlockquote(cursor: MarkdownLineCursor, baseIndent: number, options: MarkdownOptions) {
  const firstLine = currentLine(cursor);
  if (!hasBlockquoteMarker(firstLine, baseIndent)) {
    return null;
  }

  const strippedLines: string[] = [];

  while (cursor.index < cursor.lines.length) {
    const line = currentLine(cursor);
    const indent = countIndent(line);

    if (isBlankLine(line)) {
      strippedLines.push("");
      cursor.index += 1;
      continue;
    }

    if (indent < baseIndent) {
      break;
    }

    const content = sliceIndentedContent(line, baseIndent);

    if (!content.startsWith(blockquoteMarker)) {
      break;
    }

    let stripped = content.slice(1);

    if (stripped.startsWith(" ")) {
      stripped = stripped.slice(1);
    }

    strippedLines.push(stripped);
    cursor.index += 1;
  }

  return createBlockquoteBlock({
    children: parseBlocks({ index: 0, lines: strippedLines }, 0, options),
  });
}

function readFencedCode(cursor: MarkdownLineCursor, baseIndent: number) {
  const line = currentLine(cursor);
  const trimmed = sliceIndentedContent(line, baseIndent);
  const open = fencedCodeOpening.exec(trimmed);

  if (!open) {
    return null;
  }

  cursor.index += 1;
  const body: string[] = [];

  while (cursor.index < cursor.lines.length) {
    const candidate = currentLine(cursor);
    const content = sliceIndentedContent(candidate, baseIndent);

    if (content.trim() === fencedCodeMarker) {
      cursor.index += 1;
      break;
    }

    body.push(content);
    cursor.index += 1;
  }

  return createCodeBlock({
    language: open[1] ? open[1] : null,
    meta: open[2] ? open[2] : null,
    source: body.join(lineFeed),
  });
}

function readContainerDirective(cursor: MarkdownLineCursor, baseIndent: number) {
  const startLine = currentLine(cursor);
  const startContent = sliceIndentedContent(startLine, baseIndent);
  const startMatch = containerDirectiveOpening.exec(startContent);

  if (!startMatch) {
    return null;
  }

  const name = startMatch[1]!;
  const bodyLines: string[] = [];
  cursor.index += 1;

  while (cursor.index < cursor.lines.length) {
    const line = currentLine(cursor);
    const content = sliceIndentedContent(line, baseIndent);
    cursor.index += 1;

    if (content.trim() === containerDirectiveClosingMarker) {
      break;
    }

    bodyLines.push(content);
  }

  return createDirectiveBlock({
    attributes: parseDirectiveAttributes(startMatch[2] ?? ""),
    body: bodyLines.join(lineFeed),
    name,
  });
}

function parseDirectiveAttributes(suffix: string) {
  const trimmed = suffix.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function readLeafDirective(cursor: MarkdownLineCursor, baseIndent: number) {
  const line = currentLine(cursor);
  const trimmed = sliceIndentedContent(line, baseIndent);

  if (!leafDirectiveOpening.test(trimmed)) {
    return null;
  }

  cursor.index += 1;
  return createRawBlock({
    originalType: "leafDirective",
    source: trimmed,
  });
}

function readHeading(cursor: MarkdownLineCursor, baseIndent: number) {
  const line = currentLine(cursor);
  const match = atxHeading.exec(sliceIndentedContent(line, baseIndent));

  if (!match) {
    return null;
  }

  cursor.index += 1;
  return createHeadingBlock({
    children: parseInlineMarkdown(match[2].replace(atxHeadingClosingSequence, "")),
    depth: match[1].length as 1 | 2 | 3 | 4 | 5 | 6,
  });
}

function readThematicBreak(cursor: MarkdownLineCursor, baseIndent: number) {
  const trimmed = sliceIndentedContent(currentLine(cursor), baseIndent).trim();

  if (!isThematicBreak(trimmed)) {
    return null;
  }

  cursor.index += 1;
  return createDividerBlock();
}

function readList(cursor: MarkdownLineCursor, baseIndent: number, options: MarkdownOptions) {
  const firstMarker = readListMarker(currentLine(cursor), baseIndent);

  if (!firstMarker) {
    return null;
  }

  const items: ListItemBlock[] = [];
  let spread = false;

  while (cursor.index < cursor.lines.length) {
    const line = currentLine(cursor);
    const marker = readListMarker(line, baseIndent);

    if (!marker || marker.ordered !== firstMarker.ordered) {
      break;
    }

    cursor.index += 1;
    const itemLines = [marker.content];
    let itemSpread = false;

    while (cursor.index < cursor.lines.length) {
      const candidate = currentLine(cursor);
      const candidateIndent = countIndent(candidate);

      if (isBlankLine(candidate)) {
        const nextIndex = findNextNonEmptyLineIndex(cursor.lines, cursor.index + 1);

        if (nextIndex < 0 || countIndent(cursor.lines[nextIndex] ?? "") <= baseIndent) {
          break;
        }

        itemSpread = true;
        itemLines.push("");
        cursor.index += 1;
        continue;
      }

      if (candidateIndent < marker.contentIndent) {
        break;
      }

      if (candidateIndent === baseIndent && readListMarker(candidate, baseIndent)) {
        break;
      }

      itemLines.push(sliceIndentedLine(candidate, marker.contentIndent));
      cursor.index += 1;
    }

    spread ||= itemSpread;

    items.push(
      createListItemBlock({
        checked: marker.checked,
        children: parseListItemChildren(itemLines, options),
        spread: itemSpread,
      }),
    );
  }

  return createListBlock({
    items: items,
    ordered: firstMarker.ordered,
    spread,
    start:
      firstMarker.ordered && options.preserveOrderedListStart ? (firstMarker.start ?? 1) : null,
  });
}

function readRawHtmlBlock(cursor: MarkdownLineCursor, baseIndent: number) {
  const line = sliceIndentedContent(currentLine(cursor), baseIndent).trim();

  if (!looksLikeSimpleHtmlBlock(line)) {
    return null;
  }

  cursor.index += 1;
  return createRawBlock({
    originalType: "html",
    source: line,
  });
}

function readParagraph(cursor: MarkdownLineCursor, baseIndent: number) {
  const lines: string[] = [];

  while (cursor.index < cursor.lines.length) {
    const line = currentLine(cursor);
    const indent = countIndent(line);

    if (isBlankLine(line)) {
      break;
    }

    if (indent < baseIndent) {
      break;
    }

    const content = sliceIndentedContent(line, baseIndent);

    if (lines.length > 0 && shouldParagraphStop(line, content, baseIndent)) {
      break;
    }

    lines.push(content);
    cursor.index += 1;
  }

  return createParagraphBlock({
    children: parseInlineMarkdown(lines.join(lineFeed)),
  });
}

function parseListItemChildren(lines: string[], options: MarkdownOptions) {
  const blocks = parseBlocks({ index: 0, lines }, 0, options);

  if (blocks.length > 0) {
    return blocks;
  }

  return [createParagraphBlock({ children: [] })];
}

function readListMarker(line: string, baseIndent: number): ParsedListMarker | null {
  const match = listMarker.exec(line);

  if (!match || match[1].length !== baseIndent) {
    return null;
  }

  const marker = match[2];
  const ordered = orderedListMarker.test(marker);
  const start = ordered ? Number(marker.slice(0, -1)) : null;
  let content = match[3] ?? "";
  let checked: boolean | null = null;

  if (taskListMarker.test(content)) {
    checked = content[1] === "x" || content[1] === "X";
    content = content.slice(3);

    if (content.startsWith(" ")) {
      content = content.slice(1);
    }
  }

  const separatorWidth =
    content.length > 0
      ? match[0].length - match[1].length - match[2].length - content.length
      : match[0].length - match[1].length - match[2].length;

  return {
    checked,
    content,
    contentIndent: baseIndent + match[2].length + separatorWidth,
    ordered,
    start,
  };
}

function hasBlockquoteMarker(line: string, baseIndent: number) {
  return sliceIndentedContent(line, baseIndent).startsWith(blockquoteMarker);
}

function sliceIndentedContent(line: string, indent: number) {
  return line.slice(indent);
}

function sliceIndentedLine(line: string, contentIndent: number) {
  const indent = countIndent(line);

  if (indent >= contentIndent) {
    return line.slice(contentIndent);
  }

  return line.trim() === "" ? "" : line.slice(Math.min(indent, contentIndent));
}

function isThematicBreak(line: string) {
  return (
    thematicBreakAsterisk.test(line) ||
    thematicBreakHyphen.test(line) ||
    thematicBreakUnderscore.test(line)
  );
}

function looksLikeSimpleHtmlBlock(line: string) {
  return line.startsWith("<") && line.endsWith(">");
}

function countIndent(line: string) {
  let indent = 0;

  while (indent < line.length && line[indent] === " ") {
    indent += 1;
  }

  return indent;
}

function shouldParagraphStop(line: string, content: string, baseIndent: number) {
  return (
    content.startsWith(blockquoteMarker) ||
    fencedCodeOpening.test(content) ||
    containerDirectiveOpening.test(content) ||
    leafDirectiveOpening.test(content) ||
    atxHeading.test(content) ||
    isThematicBreak(content.trim()) ||
    looksLikeAlignmentRow(content) ||
    readListMarker(line, baseIndent) !== null ||
    looksLikeSimpleHtmlBlock(content.trim())
  );
}

function currentLine(cursor: MarkdownLineCursor) {
  return cursor.lines[cursor.index] ?? "";
}

function isBlankLine(line: string) {
  return line.trim() === "";
}

function findNextNonEmptyLineIndex(lines: string[], start: number) {
  for (let index = start; index < lines.length; index += 1) {
    if (!isBlankLine(lines[index] ?? "")) {
      return index;
    }
  }

  return -1;
}
