// Inline code toggling: wraps/unwraps selected text in inline code nodes.
import { type Code, type Inline } from "@/document";
import { compactInlineNodes } from "../../shared";
import type { InlineCommandReplacement, InlineCommandTarget } from "./target";
import { createInlineCommandReplacement } from "./target";
import {
  measureInlineNodeText,
  collectInlinePrefix,
  collectInlineSuffix,
  extractInlineSelectionText,
  createPathTextNode,
  createPathInlineCodeNode,
} from "./shared";

export function toggleInlineCodeTarget(
  target: InlineCommandTarget,
  startOffset: number,
  endOffset: number,
): InlineCommandReplacement | null {
  const nextChildren = compactInlineNodes(
    toggleInlineCodeNodes(target.children, startOffset, endOffset, `${target.path}.children`),
  );

  return nextChildren.length > 0
    ? createInlineCommandReplacement(target, nextChildren, startOffset, endOffset)
    : null;
}

function toggleInlineCodeNodes(
  nodes: Inline[],
  startOffset: number,
  endOffset: number,
  path: string,
): Inline[] {
  const exactInlineCode = resolveExactSelectedInlineCode(nodes, startOffset, endOffset);

  if (exactInlineCode) {
    return replaceSelectionWithInlineCode(
      nodes,
      startOffset,
      endOffset,
      exactInlineCode.code,
      path,
      false,
    );
  }

  const selectedText = extractInlineSelectionText(nodes, startOffset, endOffset);

  if (selectedText.length === 0) {
    return nodes;
  }

  return replaceSelectionWithInlineCode(nodes, startOffset, endOffset, selectedText, path, true);
}

function resolveExactSelectedInlineCode(
  nodes: Inline[],
  startOffset: number,
  endOffset: number,
): Code | null {
  let cursor = 0;

  for (const node of nodes) {
    const nodeLength = measureInlineNodeText(node);
    const nodeStart = cursor;
    const nodeEnd = nodeStart + nodeLength;
    cursor = nodeEnd;

    if (startOffset === nodeStart && endOffset === nodeEnd && node.type === "inlineCode") {
      return node;
    }

    if (node.type === "link") {
      const nested = resolveExactSelectedInlineCode(
        node.children,
        Math.max(0, startOffset - nodeStart),
        Math.min(nodeLength, endOffset - nodeStart),
      );

      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function replaceSelectionWithInlineCode(
  nodes: Inline[],
  startOffset: number,
  endOffset: number,
  selectedText: string,
  path: string,
  wrap: boolean,
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
      const selectedNode = wrap
        ? createPathInlineCodeNode(selectedText, `${path}.selected`)
        : createPathTextNode(selectedText, [], `${path}.selected`);

      if (selectedNode) {
        nextNodes.push(selectedNode);
      }
      inserted = true;
    }

    nextNodes.push(
      ...collectInlineSuffix(node, Math.min(nodeLength, endOffset - nodeStart), nodePath),
    );
  }

  return nextNodes;
}
