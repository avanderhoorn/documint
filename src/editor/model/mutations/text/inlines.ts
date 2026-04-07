import {
  createCode as createDocumentInlineCodeNode,
  createImage as createDocumentImageNode,
  createLineBreak as createDocumentLineBreakNode,
  createLink as createDocumentLinkNode,
  createRaw as createDocumentUnsupportedInlineNode,
  createText as createDocumentTextNode,
  type Inline,
} from "@/document";
import { compactInlineNodes } from "../../shared";
import type { EditorInline, RuntimeImageAttributes, RuntimeLinkAttributes } from "../../types";

// EditorInline array manipulation: splicing replacement text into inline spans
// and converting back to document Inline nodes.

type DraftEditorInline = Omit<EditorInline, "end" | "start">;

export function replaceEditorInlines(
  inlines: EditorInline[],
  startOffset: number,
  endOffset: number,
  replacementText: string,
) {
  const context = {
    didInsert: false,
    generatedRunCount: 0,
    replacementText,
  };
  const nextInlines = editEditorInlines(inlines, startOffset, endOffset, context);

  return finalizeEditorInlines(compactEditorInlines(nextInlines));
}

export function editorInlinesToDocumentInlines(inlines: EditorInline[]): Inline[] {
  const nodes: Inline[] = [];

  for (let index = 0; index < inlines.length; index += 1) {
    const run = inlines[index]!;

    if (run.link) {
      const children: Inline[] = [];
      const link = run.link;

      while (index < inlines.length && sameRuntimeLink(inlines[index]!.link, link)) {
        const child = editorInlineToDocumentInline(inlines[index]!);

        if (child) {
          children.push(child);
        }

        index += 1;
      }

      index -= 1;

      if (children.length > 0) {
        nodes.push(
          createDocumentLinkNode({
            children: compactInlineNodes(children),
            title: link.title,
            url: link.url,
          }),
        );
      }

      continue;
    }

    const node = editorInlineToDocumentInline(run);

    if (node) {
      nodes.push(node);
    }
  }

  return compactInlineNodes(nodes);
}

function editEditorInlines(
  inlines: EditorInline[],
  startOffset: number,
  endOffset: number,
  context: {
    didInsert: boolean;
    generatedRunCount: number;
    replacementText: string;
  },
): DraftEditorInline[] {
  const nextInlines: DraftEditorInline[] = [];

  for (const [index, run] of inlines.entries()) {
    if (!context.didInsert && startOffset === endOffset && startOffset === run.start) {
      pushGeneratedTextRun(
        nextInlines,
        context,
        resolveBoundaryLinkForInsertion(inlines[index - 1] ?? null, run),
      );
    }

    if (endOffset <= run.start || startOffset >= run.end) {
      nextInlines.push(createDraftEditorInline(run));
      continue;
    }

    const localStart = Math.max(0, startOffset - run.start);
    const localEnd = Math.min(run.text.length, endOffset - run.start);
    const replacement =
      !context.didInsert && context.replacementText.length > 0 ? context.replacementText : "";
    const nextForRun = replaceEditorInline(run, localStart, localEnd, replacement, context);

    if (localStart !== localEnd || replacement.length > 0) {
      context.didInsert = true;
    }

    nextInlines.push(...nextForRun);
  }

  if (!context.didInsert) {
    pushGeneratedTextRun(
      nextInlines,
      context,
      resolveBoundaryLinkForInsertion(inlines.at(-1) ?? null, null),
    );
  }

  return nextInlines;
}

function replaceEditorInline(
  run: EditorInline,
  startOffset: number,
  endOffset: number,
  replacementText: string,
  context: {
    didInsert: boolean;
    generatedRunCount: number;
    replacementText: string;
  },
) {
  switch (run.kind) {
    case "text":
    case "inlineCode":
    case "unsupported":
      return replaceTextLikeEditorInline(run, startOffset, endOffset, replacementText);
    case "break":
      return replaceBreakEditorInline(run, startOffset, endOffset, replacementText, context);
    case "image":
      return replaceImageEditorInline(run, startOffset, endOffset, replacementText);
  }
}

function replaceTextLikeEditorInline(
  run: EditorInline,
  startOffset: number,
  endOffset: number,
  replacementText: string,
) {
  const nextText = run.text.slice(0, startOffset) + replacementText + run.text.slice(endOffset);

  return nextText.length > 0
    ? [
        {
          ...createDraftEditorInline(run),
          text: nextText,
        },
      ]
    : [];
}

function replaceBreakEditorInline(
  run: EditorInline,
  startOffset: number,
  endOffset: number,
  replacementText: string,
  context: {
    didInsert: boolean;
    generatedRunCount: number;
    replacementText: string;
  },
) {
  if (startOffset === endOffset) {
    return [createDraftEditorInline(run)];
  }

  const nextInlines: DraftEditorInline[] = [];

  if (replacementText.length > 0) {
    pushGeneratedTextRun(nextInlines, context, run.link);
  }

  return nextInlines;
}

function replaceImageEditorInline(
  run: EditorInline,
  startOffset: number,
  endOffset: number,
  replacementText: string,
) {
  if (startOffset === 0 && endOffset === run.text.length) {
    return replacementText.length > 0 ? [createGeneratedTextRun(replacementText, run.link, 0)] : [];
  }

  return [createDraftEditorInline(run)];
}

function pushGeneratedTextRun(
  inlines: DraftEditorInline[],
  context: {
    didInsert: boolean;
    generatedRunCount: number;
    replacementText: string;
  },
  link: RuntimeLinkAttributes | null,
) {
  if (context.replacementText.length === 0) {
    context.didInsert = true;
    return;
  }

  inlines.push(createGeneratedTextRun(context.replacementText, link, context.generatedRunCount));
  context.generatedRunCount += 1;
  context.didInsert = true;
}

function createGeneratedTextRun(
  text: string,
  link: RuntimeLinkAttributes | null,
  index: number,
): DraftEditorInline {
  return {
    id: `generated:${index}`,
    image: null,
    inlineCode: false,
    kind: "text",
    link,
    marks: [],
    originalType: null,
    text,
  };
}

function resolveBoundaryLinkForInsertion(
  previousRun: EditorInline | null,
  nextRun: EditorInline | null,
) {
  return previousRun?.link && nextRun?.link && sameRuntimeLink(previousRun.link, nextRun.link)
    ? previousRun.link
    : null;
}

function createDraftEditorInline(run: EditorInline): DraftEditorInline {
  return {
    id: run.id,
    image: run.image,
    inlineCode: run.inlineCode,
    kind: run.kind,
    link: run.link,
    marks: run.marks,
    originalType: run.originalType,
    text: run.text,
  };
}

function finalizeEditorInlines(inlines: DraftEditorInline[]) {
  const finalized: EditorInline[] = [];
  let position = 0;

  for (const run of inlines) {
    const start = position;
    const end = start + run.text.length;

    finalized.push({
      ...run,
      end,
      start,
    });
    position = end;
  }

  return finalized;
}

function compactEditorInlines(inlines: DraftEditorInline[]) {
  const compacted: DraftEditorInline[] = [];

  for (const run of inlines) {
    const previous = compacted.at(-1);

    if (previous && canMergeEditorInlines(previous, run)) {
      compacted[compacted.length - 1] = {
        ...previous,
        text: previous.text + run.text,
      };
      continue;
    }

    compacted.push(run);
  }

  return compacted;
}

function canMergeEditorInlines(previous: DraftEditorInline, next: DraftEditorInline) {
  return (
    previous.kind === next.kind &&
    previous.inlineCode === next.inlineCode &&
    sameRuntimeLink(previous.link, next.link) &&
    sameRuntimeImage(previous.image, next.image) &&
    previous.originalType === next.originalType &&
    previous.marks.join(",") === next.marks.join(",")
  );
}

function editorInlineToDocumentInline(run: EditorInline): Inline | null {
  switch (run.kind) {
    case "break":
      return createDocumentLineBreakNode();
    case "image":
      return run.image ? createImageNodeFromRuntimeAttributes(run.image) : null;
    case "inlineCode":
      return createDocumentInlineCodeNode({
        code: run.text,
      });
    case "text":
      return run.text.length > 0
        ? createDocumentTextNode({
            marks: run.marks,
            text: run.text,
          })
        : null;
    case "unsupported":
      return createDocumentUnsupportedInlineNode({
        originalType: run.originalType ?? "unsupported",
        source: run.text,
      });
  }
}

function createImageNodeFromRuntimeAttributes(image: RuntimeImageAttributes) {
  return createDocumentImageNode({
    alt: image.alt,
    title: image.title,
    url: image.url,
    width: image.width,
  });
}

function sameRuntimeLink(left: RuntimeLinkAttributes | null, right: RuntimeLinkAttributes | null) {
  return left?.url === right?.url && left?.title === right?.title;
}

function sameRuntimeImage(
  left: RuntimeImageAttributes | null,
  right: RuntimeImageAttributes | null,
) {
  return (
    left?.url === right?.url &&
    left?.title === right?.title &&
    left?.alt === right?.alt &&
    left?.width === right?.width
  );
}
