import { expect, test } from "bun:test";
import { createParagraphTextBlock, spliceDocument } from "@/document";
import {
  createDocumentIndex,
  buildEditorRoots,
  createEditorRoot,
  rebuildEditorRoot,
  spliceDocumentIndex,
} from "@/editor/model";
import { parseMarkdown } from "@/markdown";

test("builds positioned editor roots directly on the unified model", () => {
  const snapshot = parseMarkdown(`# Heading

  alpha

beta
`);
  const roots = buildEditorRoots(
    snapshot.blocks.map((block, rootIndex) => createEditorRoot(block, rootIndex)),
  );
  const runtime = createDocumentIndex(snapshot);

  expect(roots).toHaveLength(3);
  expect(roots[0]?.regions[0]?.start).toBe(0);
  expect(roots[1]?.regions[0]?.start).toBe(roots[1]?.start);
  expect(runtime.roots[1]?.start).toBe(runtime.roots[0]!.end + 1);
  expect(runtime.roots[2]?.start).toBe(runtime.roots[1]!.end + 1);
  expect(runtime.roots[2]?.regionRange?.start).toBe(runtime.roots[1]?.regionRange?.end);
});

test("rebuilds a root model against a normalized replacement root", () => {
  const snapshot = parseMarkdown(`# Heading

alpha
`);
  const original = createEditorRoot(snapshot.blocks[1]!, 1);
  const nextDocument = spliceDocument(snapshot, 1, 1, [
    createParagraphTextBlock({ text: "omega" }),
  ]);
  const rebuilt = rebuildEditorRoot(original, nextDocument.blocks[1]!);

  expect(rebuilt.rootIndex).toBe(1);
  expect(rebuilt.regions[0]?.path).toBe("root.1.children");
  expect(rebuilt.regions[0]?.text).toBe("omega");
});

test("splices one editor model root while preserving unchanged sibling content", () => {
  const snapshot = parseMarkdown(`# Heading

alpha

beta
`);
  const model = createDocumentIndex(snapshot);
  const runtime = createDocumentIndex(snapshot);
  const nextDocument = spliceDocument(snapshot, 1, 1, [
    createParagraphTextBlock({ text: "alphabet" }),
  ]);
  const replacedModel = spliceDocumentIndex(model, nextDocument, 1, 1);
  const replaced = spliceDocumentIndex(runtime, nextDocument, 1, 1);

  expect(replacedModel.document).toBe(nextDocument);
  expect(replacedModel.roots[0]).toBe(model.roots[0]);
  expect(replacedModel.roots[1]).not.toBe(model.roots[1]);
  expect(replacedModel.roots[2]).not.toBe(model.roots[2]);
  expect(replacedModel.roots[2]?.regions[0]?.id).toBe(model.roots[2]?.regions[0]?.id);
  expect(replaced.roots[0]).toBe(runtime.roots[0]);
  expect(replaced.roots[1]).not.toBe(runtime.roots[1]);
  expect(replaced.roots[2]).not.toBe(runtime.roots[2]);
  expect(replaced.roots[2]?.regions[0]?.id).toBe(runtime.roots[2]?.regions[0]?.id);
  expect(replaced.regions[2]?.start).toBe(runtime.regions[2]!.start + 3);
});
