import type { Mark } from "@/document";
import type { EditorState } from "./model/state";

export type CanvasActiveBlockRegion = {
  blockId: string;
  depth: number;
  nodeType: string;
  text: string;
};

export type CanvasActiveSpanRegion =
  | {
      kind: "link";
      url: string;
    }
  | {
      kind: "marks";
      marks: Mark[];
    }
  | {
      kind: "none";
    };

export type CanvasEditablePreviewState = {
  activeBlock: CanvasActiveBlockRegion | null;
  activeSpan: CanvasActiveSpanRegion;
};

export function getCanvasEditablePreviewState(state: EditorState): CanvasEditablePreviewState {
  const container = state.documentIndex.regionIndex.get(state.selection.anchor.regionId) ?? null;
  const block = container ? (state.documentIndex.blockIndex.get(container.blockId) ?? null) : null;
  const offset = state.selection.anchor.offset;
  const run =
    container?.inlines.find((entry) => offset > entry.start && offset < entry.end) ??
    container?.inlines.find((entry) => entry.end === offset) ??
    container?.inlines.find((entry) => entry.start === offset) ??
    null;

  return {
    activeBlock: block
      ? {
          blockId: block.id,
          depth: block.depth,
          nodeType: block.type,
          text: container?.text ?? "",
        }
      : null,
    activeSpan: run?.link
      ? {
          kind: "link",
          url: run.link.url,
        }
      : run && run.marks.length > 0
        ? {
            kind: "marks",
            marks: run.marks,
          }
        : {
            kind: "none",
          },
  };
}
