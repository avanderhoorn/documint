// Shared constants and utility functions used across multiple editor model modules.
import { createText as createDocumentTextNode, type Inline } from "@/document";

export const INLINE_OBJECT_REPLACEMENT_TEXT = "\uFFFC";

// Multiplier for combining region order index with character offset into a
// single comparable number for selection ordering.
export const SELECTION_ORDER_MULTIPLIER = 1_000_000;

export function createTableCellRegionKey(blockId: string, rowIndex: number, cellIndex: number) {
  return `${blockId}:${rowIndex}:${cellIndex}`;
}

export function compactInlineNodes(nodes: Inline[]) {
  const compacted: Inline[] = [];

  for (const node of nodes) {
    const previous = compacted.at(-1);

    if (
      previous?.type === "text" &&
      node.type === "text" &&
      previous.marks.join(",") === node.marks.join(",")
    ) {
      compacted[compacted.length - 1] = createDocumentTextNode({
        marks: previous.marks,
        path: previous.id,
        text: previous.text + node.text,
      });
      continue;
    }

    compacted.push(node);
  }

  return compacted;
}
