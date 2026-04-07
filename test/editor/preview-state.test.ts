import { expect, test } from "bun:test";
import { getCanvasEditablePreviewState } from "@/editor/preview-state";
import { createEditorState, setSelection } from "@/editor/model";
import { parseMarkdown } from "@/markdown";

test("derives active block and active span state from the canvas selection", () => {
  let state = createEditorState(
    parseMarkdown("Paragraph with **strong** text and [link](https://example.com).\n"),
  );
  const container = state.documentIndex.regions[0];

  if (!container) {
    throw new Error("Expected container");
  }

  state = setSelection(state, {
    regionId: container.id,
    offset: container.text.indexOf("strong") + 1,
  });

  const marked = getCanvasEditablePreviewState(state);

  expect(marked.activeBlock?.nodeType).toBe("paragraph");
  expect(marked.activeSpan.kind).toBe("marks");

  state = setSelection(state, {
    regionId: container.id,
    offset: container.text.indexOf("link") + 1,
  });

  const linked = getCanvasEditablePreviewState(state);

  expect(linked.activeSpan.kind).toBe("link");
  expect(linked.activeSpan.kind === "link" ? linked.activeSpan.url : null).toBe(
    "https://example.com",
  );
});
