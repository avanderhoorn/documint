// Inline line break insertion: inserts soft breaks within inline content.
import { createLineBreak as createDocumentLineBreakNode, type Inline } from "@/document";
import { compactInlineNodes } from "../../shared";
import type { InlineCommandReplacement, InlineCommandTarget } from "./target";
import { createInlineCommandReplacement } from "./target";
import { measureInlineNodeText, collectInlinePrefix, collectInlineSuffix } from "./shared";

export function insertInlineLineBreakTarget(
  target: InlineCommandTarget,
  startOffset: number,
  endOffset: number,
): InlineCommandReplacement {
  const nextChildren = compactInlineNodes(
    replaceSelectionWithInlineLineBreak(
      target.children,
      startOffset,
      endOffset,
      `${target.path}.children`,
    ),
  );

  return createInlineCommandReplacement(target, nextChildren, startOffset + 1, startOffset + 1);
}

function replaceSelectionWithInlineLineBreak(
  nodes: Inline[],
  startOffset: number,
  endOffset: number,
  path: string,
): Inline[] {
  const nextNodes: Inline[] = [];
  let cursor = 0;
  let inserted = false;

  for (const [index, node] of nodes.entries()) {
    const nodePath = `${path}.${index}`;
    const nodeLength = measureInlineNodeText(node);
    const nodeStart = cursor;
    const nodeEnd = nodeStart + nodeLength;
    cursor = nodeEnd;

    if (endOffset <= nodeStart || startOffset >= nodeEnd) {
      nextNodes.push(node);
      continue;
    }

    if (!inserted) {
      nextNodes.push(...collectInlinePrefix(node, Math.max(0, startOffset - nodeStart), nodePath));
      nextNodes.push(
        createDocumentLineBreakNode({
          path: `${path}.selected`,
        }),
      );
      inserted = true;
    }

    nextNodes.push(
      ...collectInlineSuffix(node, Math.min(nodeLength, endOffset - nodeStart), nodePath),
    );
  }

  if (!inserted) {
    nextNodes.push(
      createDocumentLineBreakNode({
        path: `${path}.selected`,
      }),
    );
  }

  return nextNodes;
}
