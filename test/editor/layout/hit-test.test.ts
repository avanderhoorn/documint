import { expect, test } from "bun:test";
import { createEditorState } from "@/editor/state";
import {
  createDocumentLayout,
  resolveDragFocusPoint,
  resolveLinkHitAtPoint,
} from "@/editor/layout";
import { parseMarkdown } from "@/markdown";

test("resolves link hits from document-space coordinates over linked text", () => {
  const state = createEditorState(parseMarkdown("[alpha](https://example.com) tail\n"));
  const layout = createDocumentLayout(state.documentIndex, {
    width: 320,
  });
  const line = layout.lines[0];

  if (!line) {
    throw new Error("Expected first layout line");
  }

  expect(
    resolveLinkHitAtPoint(layout, state, {
      x: line.left + 4,
      y: line.top + 4,
    })?.url,
  ).toBe("https://example.com");
});

test("resolves drag focus to the anchor start above the prepared layout", () => {
  const state = createEditorState(parseMarkdown("alpha beta\n"));
  const layout = createDocumentLayout(state.documentIndex, {
    width: 320,
  });
  const region = state.documentIndex.regions[0];
  const firstLine = layout.lines[0];

  if (!region || !firstLine) {
    throw new Error("Expected first region and first layout line");
  }

  expect(
    resolveDragFocusPoint(
      layout,
      state,
      {
        x: firstLine.left,
        y: firstLine.top - 40,
      },
      {
        regionId: region.id,
        offset: 4,
      },
    ),
  ).toEqual({
    offset: 0,
    regionId: region.id,
  });
});

test("resolves drag focus into a different region instead of clamping to the anchor", () => {
  const state = createEditorState(parseMarkdown("alpha\n\nbeta\n"));
  const layout = createDocumentLayout(state.documentIndex, {
    width: 320,
  });
  const [firstRegion, secondRegion] = state.documentIndex.regions;

  if (!firstRegion || !secondRegion) {
    throw new Error("Expected two paragraph regions");
  }

  const secondLine = layout.lines.find((line) => line.regionId === secondRegion.id);

  if (!secondLine) {
    throw new Error("Expected a layout line for the second region");
  }

  expect(
    resolveDragFocusPoint(
      layout,
      state,
      {
        x: secondLine.left + 4,
        y: secondLine.top + secondLine.height / 2,
      },
      {
        regionId: firstRegion.id,
        offset: 2,
      },
    ),
  ).toEqual({
    offset: expect.any(Number),
    regionId: secondRegion.id,
  });
});

test("resolves drag focus to the anchor end below the prepared layout", () => {
  const state = createEditorState(parseMarkdown("alpha beta\n"));
  const layout = createDocumentLayout(state.documentIndex, {
    width: 320,
  });
  const region = state.documentIndex.regions[0];
  const lastLine = layout.lines.at(-1);

  if (!region || !lastLine) {
    throw new Error("Expected first region and last layout line");
  }

  expect(
    resolveDragFocusPoint(
      layout,
      state,
      {
        x: lastLine.left,
        y: lastLine.top + lastLine.height + 40,
      },
      {
        regionId: region.id,
        offset: 4,
      },
    ),
  ).toEqual({
    offset: region.text.length,
    regionId: region.id,
  });
});
