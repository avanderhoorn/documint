import { expect, test } from "bun:test";
import { createParagraphTextBlock } from "@/document";
import {
  createDocumentIndex,
  createEditorState,
  createDocumentFromEditorState,
  replaceEditorBlock,
  replaceEditorRootRange,
  toggleTaskItem,
} from "@/editor/state";
import { parseMarkdown, serializeMarkdown } from "@/markdown";

test("replaces a nested editor block through the reducer", () => {
  const documentIndex = createDocumentIndex(parseMarkdown("- alpha\n"));
  const paragraph = documentIndex.blocks.find((block) => block.type === "paragraph");

  if (!paragraph) {
    throw new Error("Expected paragraph block");
  }

  const reduction = replaceEditorBlock(
    documentIndex,
    paragraph.id,
    createParagraphTextBlock({ text: "beta" }),
  );

  if (!reduction) {
    throw new Error("Expected nested block replacement");
  }

  expect(serializeMarkdown(reduction.document)).toBe("- beta\n");
});

test("replaces a root range through the reducer", () => {
  const documentIndex = createDocumentIndex(parseMarkdown("alpha\n\nbeta\n"));
  const reduction = replaceEditorRootRange(documentIndex, 1, 1, [
    createParagraphTextBlock({ text: "omega" }),
  ]);

  expect(serializeMarkdown(reduction.document)).toBe("alpha\n\nomega\n");
});

test("toggles task list state through the action dispatcher", () => {
  const state = createEditorState(parseMarkdown("- [ ] task\n"));
  const taskItem = state.documentIndex.blocks.find((block) => block.type === "listItem");

  if (!taskItem) {
    throw new Error("Expected task list item");
  }

  const nextState = toggleTaskItem(state, taskItem.id);

  if (!nextState) {
    throw new Error("Expected task toggle state");
  }

  expect(serializeMarkdown(createDocumentFromEditorState(nextState))).toBe("- [x] task\n");
});
