import { expect, test } from "bun:test";
import { deleteSelectionText, replaceSelectionText } from "@/editor/model";
import { createDocumentFromEditorState, createEditorState, setSelection } from "@/editor/model";
import { parseMarkdown, serializeMarkdown } from "@/markdown";

test("replaces and deletes selected text within a single canvas container", () => {
  let state = createEditorState(parseMarkdown("Paragraph body.\n"));
  const paragraph = state.documentIndex.regions[0];

  if (!paragraph) {
    throw new Error("Expected paragraph container");
  }

  state = setSelection(state, {
    anchor: {
      regionId: paragraph.id,
      offset: 0,
    },
    focus: {
      regionId: paragraph.id,
      offset: "Paragraph".length,
    },
  });
  state = replaceSelectionText(state, "Selected");

  expect(serializeMarkdown(createDocumentFromEditorState(state))).toBe("Selected body.\n");

  const selectedBody = state.documentIndex.regions[0];

  if (!selectedBody) {
    throw new Error("Expected updated paragraph container");
  }

  state = setSelection(state, {
    anchor: {
      regionId: selectedBody.id,
      offset: "Selected".length,
    },
    focus: {
      regionId: selectedBody.id,
      offset: "Selected body".length,
    },
  });
  state = deleteSelectionText(state);

  expect(serializeMarkdown(createDocumentFromEditorState(state))).toBe("Selected.\n");
});
