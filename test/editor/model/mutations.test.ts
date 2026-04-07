import { expect, test } from "bun:test";
import { createParagraphTextBlock } from "@/document";
import {
  createDocumentIndex,
  createEditorState,
  createDocumentFromEditorState,
  replaceEditorBlock,
  replaceEditorRootRange,
  toggleTaskItem,
} from "@/editor/model";
import { parseMarkdown, serializeMarkdown } from "@/markdown";

test("replaces a nested editor block through the structural mutation kernel", () => {
  const documentIndex = createDocumentIndex(parseMarkdown("- alpha\n"));
  const paragraph = documentIndex.blocks.find((block) => block.type === "paragraph");

  if (!paragraph) {
    throw new Error("Expected paragraph block");
  }

  const mutation = replaceEditorBlock(
    documentIndex,
    paragraph.id,
    createParagraphTextBlock({ text: "beta" }),
  );

  if (!mutation) {
    throw new Error("Expected nested block replacement");
  }

  expect(serializeMarkdown(mutation.document)).toBe("- beta\n");
});

test("replaces a root range through the structural mutation kernel", () => {
  const documentIndex = createDocumentIndex(parseMarkdown("alpha\n\nbeta\n"));
  const mutation = replaceEditorRootRange(documentIndex, 1, 1, [
    createParagraphTextBlock({ text: "omega" }),
  ]);

  expect(serializeMarkdown(mutation.document)).toBe("alpha\n\nomega\n");
});

test("toggles task list state through the transaction system", () => {
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
