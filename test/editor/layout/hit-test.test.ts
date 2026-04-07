import { expect, test } from "bun:test";
import { createEditorState } from "@/editor/model/state";
import { resolveLinkHitFromPointerEvent } from "@/editor/layout/hit-test";
import { createDocumentLayout } from "@/editor/layout";
import { parseMarkdown } from "@/markdown";

test("resolves link hits from pointer coordinates over linked text", () => {
  const state = createEditorState(parseMarkdown("[alpha](https://example.com) tail\n"));
  const layout = createDocumentLayout(state.documentEditor, {
    width: 320,
  });
  const line = layout.lines[0];

  if (!line) {
    throw new Error("Expected first layout line");
  }

  const event = {
    clientX: line.left + 4,
    clientY: line.top + 4,
    currentTarget: {
      getBoundingClientRect: () => ({
        bottom: 200,
        left: 0,
        right: 320,
        top: 0,
      }),
      parentElement: {
        scrollLeft: 0,
        scrollTop: 0,
      },
    },
  } as unknown as React.PointerEvent<HTMLCanvasElement>;

  expect(resolveLinkHitFromPointerEvent(event, layout, state)?.url).toBe("https://example.com");
});
