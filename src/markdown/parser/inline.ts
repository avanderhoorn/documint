/**
 * Parses paragraph-like inline markdown into semantic inline nodes.
 */
import { createCode, createImage, createLink, createRaw, createText } from "@/document";
import type { Inline, Mark } from "@/document";
import { underlineCloseTag, underlineOpenTag } from "../shared";

const inlineCodeMarker = "`";
const escapeMarker = "\\";
const imageOpening = "![";
const linkOpening = "[";
const linkDestinationOpening = "(";
const linkDestinationClosing = ")";
const spaceCharacter = " ";
const directiveMarker = ":";
const textDirectiveNameStart = /[A-Za-z]/;
const textDirectiveNameCharacter = /[-A-Za-z0-9_]/;
const imageWidthAttribute = /^\{width=([1-9]\d*)\}/;
const markdownTextEscape = /\\([\\`*_[\]{}()#+\-.!~|])/g;
const markdownDestinationEscape = /\\(.)/g;
const inlineMarkDelimiters = [
  { delimiter: "**", mark: "bold" },
  { delimiter: "~~", mark: "strikethrough" },
  { delimiter: "*", mark: "italic" },
] as const;

export function parseInlineMarkdown(source: string, marks: Mark[] = []): Inline[] {
  return parseInlineRange(source, 0, source.length, marks);
}

function parseInlineRange(source: string, start: number, end: number, marks: Mark[]): Inline[] {
  const nodes: Inline[] = [];
  let index = start;
  let textStart = start;

  while (index < end) {
    const token = readInlineToken(source, index, end, marks);

    if (token) {
      flushText(nodes, source.slice(textStart, index), marks);
      nodes.push(...token.nodes);
      index = token.end;
      textStart = index;
      continue;
    }

    if (source[index] === escapeMarker) {
      index += Math.min(2, end - index);
      continue;
    }

    index += 1;
  }

  flushText(nodes, source.slice(textStart, end), marks);
  return mergeAdjacentText(nodes);
}

function readInlineToken(source: string, index: number, end: number, marks: Mark[]) {
  switch (source[index]) {
    case directiveMarker:
      return readInlineDirectiveToken(source, index, end);
    case "<":
      return readUnderlineToken(source, index, end, marks);
    case inlineCodeMarker:
      return readInlineCodeToken(source, index, end);
    case "!":
      return readImageToken(source, index, end);
    case linkOpening:
      return readLinkToken(source, index, end, marks);
    case "*":
    case "~":
      return readDelimitedMarkToken(source, index, end, marks);
    default:
      return null;
  }
}

function flushText(nodes: Inline[], value: string, marks: Mark[]) {
  if (value.length === 0) {
    return;
  }

  nodes.push(
    createText({
      marks,
      text: unescapeMarkdownText(value),
    }),
  );
}

function createRawInline(originalType: string, raw: string) {
  return createRaw({
    originalType,
    source: raw,
  });
}

function mergeAdjacentText(nodes: Inline[]) {
  const merged: Inline[] = [];

  for (const node of nodes) {
    const previous = merged.at(-1);

    if (
      previous?.type === "text" &&
      node.type === "text" &&
      hasMatchingMarks(previous.marks, node.marks)
    ) {
      merged[merged.length - 1] = createText({
        marks: previous.marks,
        text: previous.text + node.text,
      });
      continue;
    }

    merged.push(node);
  }

  return merged;
}

function readDelimitedMark(source: string, index: number, end: number) {
  for (const spec of inlineMarkDelimiters) {
    if (!source.startsWith(spec.delimiter, index)) {
      continue;
    }

    const closeIndex = source.indexOf(spec.delimiter, index + spec.delimiter.length);

    if (closeIndex < 0 || closeIndex >= end) {
      continue;
    }

    return {
      contentEnd: closeIndex,
      contentStart: index + spec.delimiter.length,
      end: closeIndex + spec.delimiter.length,
      mark: spec.mark,
    };
  }

  return null;
}

function readDelimitedMarkToken(source: string, index: number, end: number, marks: Mark[]) {
  const delimited = readDelimitedMark(source, index, end);

  if (!delimited) {
    return null;
  }

  return {
    end: delimited.end,
    nodes: parseInlineRange(source, delimited.contentStart, delimited.contentEnd, [
      ...marks,
      delimited.mark,
    ]),
  };
}

function hasMatchingMarks(previous: Mark[], next: Mark[]) {
  return previous.length === next.length && previous.every((mark, index) => mark === next[index]);
}

function readInlineCode(source: string, index: number, end: number) {
  if (source[index] !== inlineCodeMarker) {
    return null;
  }

  let fenceWidth = 1;

  while (index + fenceWidth < end && source[index + fenceWidth] === inlineCodeMarker) {
    fenceWidth += 1;
  }

  const fence = inlineCodeMarker.repeat(fenceWidth);
  const closeIndex = source.indexOf(fence, index + fenceWidth);

  if (closeIndex < 0 || closeIndex >= end) {
    return null;
  }

  return {
    end: closeIndex + fenceWidth,
    value: source.slice(index + fenceWidth, closeIndex),
  };
}

function readInlineCodeToken(source: string, index: number, end: number) {
  const code = readInlineCode(source, index, end);

  if (!code) {
    return null;
  }

  return {
    end: code.end,
    nodes: [
      createCode({
        code: code.value,
      }),
    ],
  };
}

function readImageToken(source: string, index: number, end: number) {
  if (!source.startsWith(imageOpening, index)) {
    return null;
  }

  const labelEnd = findClosingBracket(source, index + 1, end);

  if (labelEnd < 0 || source[labelEnd + 1] !== linkDestinationOpening) {
    return null;
  }

  const destination = readLinkDestination(source, labelEnd + 1, end);

  if (!destination) {
    return null;
  }

  const width = readImageWidth(source, destination.end, end);

  return {
    end: width?.end ?? destination.end,
    nodes: [
      createImage({
        alt: unescapeMarkdownText(source.slice(index + imageOpening.length, labelEnd)),
        title: destination.title,
        url: destination.url,
        width: width?.width ?? null,
      }),
    ],
  };
}

function readLinkToken(source: string, index: number, end: number, marks: Mark[]) {
  if (source[index] !== linkOpening || source.startsWith(imageOpening, index - 1)) {
    return null;
  }

  const labelEnd = findClosingBracket(source, index, end);

  if (labelEnd < 0 || source[labelEnd + 1] !== linkDestinationOpening) {
    return null;
  }

  const destination = readLinkDestination(source, labelEnd + 1, end);

  if (!destination) {
    return null;
  }

  return {
    end: destination.end,
    nodes: [
      createLink({
        children: parseInlineMarkdown(source.slice(index + linkOpening.length, labelEnd), marks),
        title: destination.title,
        url: destination.url,
      }),
    ],
  };
}

function readLinkDestination(source: string, openParenIndex: number, end: number) {
  let index = skipSpaces(source, openParenIndex + 1, end);

  let urlEnd = index;

  while (
    urlEnd < end &&
    source[urlEnd] !== linkDestinationClosing &&
    source[urlEnd] !== spaceCharacter
  ) {
    if (source[urlEnd] === escapeMarker) {
      urlEnd += 2;
      continue;
    }

    urlEnd += 1;
  }

  if (urlEnd === index) {
    return null;
  }

  const url = unescapeMarkdownDestination(source.slice(index, urlEnd));
  index = skipSpaces(source, urlEnd, end);
  let title: string | null = null;

  if (index < end && source[index] === '"') {
    const titleEnd = findUnescapedCharacter(source, '"', index + 1, end);

    if (titleEnd < 0) {
      return null;
    }

    title = source.slice(index + 1, titleEnd).replace(markdownDestinationEscape, "$1");
    index = skipSpaces(source, titleEnd + 1, end);
  }

  if (source[index] !== linkDestinationClosing) {
    return null;
  }

  return {
    end: index + 1,
    title,
    url,
  };
}

function readImageWidth(source: string, index: number, end: number) {
  const match = imageWidthAttribute.exec(source.slice(index, end));

  if (!match) {
    return null;
  }

  return {
    end: index + match[0].length,
    width: Number(match[1]),
  };
}

function readUnderlineToken(source: string, index: number, end: number, marks: Mark[]) {
  if (!source.startsWith(underlineOpenTag, index)) {
    return readRawHtmlToken(source, index, end);
  }

  const closeIndex = source.indexOf(underlineCloseTag, index + underlineOpenTag.length);

  if (closeIndex < 0 || closeIndex >= end) {
    return {
      end: index + underlineOpenTag.length,
      nodes: [createRawInline("html", underlineOpenTag)],
    };
  }

  return {
    end: closeIndex + underlineCloseTag.length,
    nodes: parseInlineRange(source, index + underlineOpenTag.length, closeIndex, [
      ...marks,
      "underline",
    ]),
  };
}

function readRawHtmlToken(source: string, index: number, end: number) {
  if (source[index] !== "<") {
    return null;
  }

  const closeIndex = source.indexOf(">", index + 1);

  if (closeIndex < 0 || closeIndex >= end) {
    return null;
  }

  return {
    end: closeIndex + 1,
    nodes: [createRawInline("html", source.slice(index, closeIndex + 1))],
  };
}

function readInlineDirectiveToken(source: string, index: number, end: number) {
  if (source[index] !== directiveMarker || !textDirectiveNameStart.test(source[index + 1] ?? "")) {
    return null;
  }

  let cursor = index + 2;

  while (cursor < end && textDirectiveNameCharacter.test(source[cursor] ?? "")) {
    cursor += 1;
  }

  const label = readBracketedSegment(source, cursor, end, "[", "]");
  const attributes = readBracketedSegment(source, label?.end ?? cursor, end, "{", "}");
  const rawEnd = attributes?.end ?? label?.end ?? cursor;

  return {
    end: rawEnd,
    nodes: [createRawInline("textDirective", source.slice(index, rawEnd))],
  };
}

function readBracketedSegment(
  source: string,
  index: number,
  end: number,
  open: string,
  close: string,
) {
  if (source[index] !== open) {
    return null;
  }

  const closeIndex = findClosingCharacter(source, close, index + 1, end);

  if (closeIndex < 0) {
    return null;
  }

  return {
    end: closeIndex + 1,
  };
}

function findClosingBracket(source: string, openBracketIndex: number, end: number) {
  return findClosingCharacter(source, "]", openBracketIndex + 1, end);
}

function findClosingCharacter(source: string, character: string, start: number, end: number) {
  return findUnescapedCharacter(source, character, start, end);
}

function findUnescapedCharacter(source: string, character: string, start: number, end: number) {
  for (let index = start; index < end; index += 1) {
    if (source[index] === escapeMarker) {
      index += 1;
      continue;
    }

    if (source[index] === character) {
      return index;
    }
  }

  return -1;
}

function skipSpaces(source: string, index: number, end: number) {
  while (index < end && source[index] === spaceCharacter) {
    index += 1;
  }

  return index;
}

function unescapeMarkdownText(value: string) {
  return value.replace(markdownTextEscape, "$1");
}

function unescapeMarkdownDestination(value: string) {
  return value.replace(markdownDestinationEscape, "$1");
}
