import { expect, test } from "bun:test";
import { createEditor } from "@/editor";
import { getEditorAnimationDuration } from "@/editor/canvas/animations";
import { createDocumentLayout } from "@/editor/layout";
import { serializeMarkdown } from "@/markdown";
import { parseMarkdown } from "@/markdown";

test("extends the selection to the current line boundary for modified shift-arrow navigation", () => {
  const editor = createEditor();
  const state = editor.createState(parseMarkdown("alpha beta gamma"));
  const container = state.documentIndex.regions[0];

  expect(container).toBeDefined();

  const layout = createDocumentLayout(state.documentIndex, { width: 90 });
  const nextState = editor.setSelection(state, {
    anchor: {
      regionId: container!.id,
      offset: container!.text.length,
    },
    focus: {
      regionId: container!.id,
      offset: container!.text.length,
    },
  }).state;
  const result = editor.moveCaretToLineBoundary(nextState, layout, "Home", true);

  expect(result).not.toBeNull();
  expect(result!.state.selection.anchor.regionId).toBe(container!.id);
  expect(result!.state.selection.anchor.offset).toBe(container!.text.length);
  expect(result!.state.selection.focus.regionId).toBe(container!.id);
  expect(result!.state.selection.focus.offset).toBeGreaterThan(0);
  expect(result!.state.selection.focus.offset).toBeLessThan(container!.text.length);
});

test("deletes adjacent images atomically", () => {
  const editor = createEditor();
  const state = editor.createState(
    parseMarkdown("before ![alt](https://example.com/image.png) after\n"),
  );
  const container = state.documentIndex.regions[0];

  if (!container) {
    throw new Error("Expected paragraph container");
  }

  const imageRun = container.inlines.find((run) => run.kind === "image");

  if (!imageRun) {
    throw new Error("Expected image run");
  }

  const backward = editor.deleteBackward(
    editor.setSelection(state, {
      regionId: container.id,
      offset: imageRun.end,
    }).state,
  );
  const forward = editor.deleteForward(
    editor.setSelection(state, {
      regionId: container.id,
      offset: imageRun.start,
    }).state,
  );

  expect(backward).not.toBeNull();
  expect(forward).not.toBeNull();
  expect(serializeMarkdown(editor.getDocument(backward!.state))).toBe("before  after\n");
  expect(serializeMarkdown(editor.getDocument(forward!.state))).toBe("before  after\n");
});

test("does not persist a typed trailing prose space as a markdown entity", () => {
  const editor = createEditor();
  const state = editor.createState(parseMarkdown("alpha\n"));
  const region = state.documentIndex.regions[0];

  if (!region) {
    throw new Error("Expected paragraph region");
  }

  const result = editor.insertText(
    editor.setSelection(state, {
      regionId: region.id,
      offset: region.text.length,
    }).state,
    " ",
  );

  expect(result).not.toBeNull();
  expect(serializeMarkdown(editor.getDocument(result!.state))).toBe("alpha\n");
});

test("starts and expires inserted-text highlight animations for typed text", () => {
  const editor = createEditor();
  const state = editor.createState(parseMarkdown("alpha\n"));
  const region = state.documentIndex.regions[0];

  if (!region) {
    throw new Error("Expected paragraph region");
  }

  const result = editor.insertText(
    editor.setSelection(state, {
      regionId: region.id,
      offset: region.text.length,
    }).state,
    "!",
  );

  expect(result).not.toBeNull();
  expect(result!.animationStarted).toBe(true);
  expect(result!.state.animations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        endOffset: region.text.length + 1,
        kind: "inserted-text-highlight",
        regionPath: region.path,
        startOffset: region.text.length,
      }),
    ]),
  );

  const effect = result!.state.animations.find(
    (animation) => animation.kind === "inserted-text-highlight",
  );

  expect(effect).toBeDefined();
  expect(editor.hasRunningAnimations(result!.state, effect!.startedAt + 10)).toBe(true);
  expect(
    editor.hasRunningAnimations(
      result!.state,
      effect!.startedAt + getEditorAnimationDuration(effect!) + 10,
    ),
  ).toBe(false);
});

test("starts a punctuation pulse animation when typing a period", () => {
  const editor = createEditor();
  const state = editor.createState(parseMarkdown("alpha\n"));
  const region = state.documentIndex.regions[0];

  if (!region) {
    throw new Error("Expected paragraph region");
  }

  const stateUpdate = editor.insertText(
    editor.setSelection(state, {
      regionId: region.id,
      offset: region.text.length,
    }).state,
    ".",
  );

  expect(stateUpdate).not.toBeNull();
  expect(stateUpdate!.animationStarted).toBe(true);
  expect(stateUpdate!.state.animations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "punctuation-pulse",
        offset: region.text.length,
        regionPath: region.path,
      }),
    ]),
  );

  const pulse = stateUpdate!.state.animations.find(
    (animation) => animation.kind === "punctuation-pulse",
  );
  const stateWithPunctuationPulseOnly = {
    ...stateUpdate!.state,
    animations: pulse ? [pulse] : [],
  };

  expect(pulse).toBeDefined();
  expect(editor.hasRunningAnimations(stateWithPunctuationPulseOnly, pulse!.startedAt + 10)).toBe(
    true,
  );
  expect(
    editor.hasRunningAnimations(
      stateWithPunctuationPulseOnly,
      pulse!.startedAt + getEditorAnimationDuration(pulse!) + 10,
    ),
  ).toBe(false);
});

test("does not start a punctuation pulse animation for ordinary text input", () => {
  const editor = createEditor();
  const state = editor.createState(parseMarkdown("alpha\n"));
  const region = state.documentIndex.regions[0];

  if (!region) {
    throw new Error("Expected paragraph region");
  }

  const stateUpdate = editor.insertText(
    editor.setSelection(state, {
      regionId: region.id,
      offset: region.text.length,
    }).state,
    "a",
  );

  expect(stateUpdate).not.toBeNull();
  expect(
    stateUpdate!.state.animations.some((animation) => animation.kind === "punctuation-pulse"),
  ).toBe(false);
});

test("starts and expires deleted-text fade animations for single-character deletes", () => {
  const editor = createEditor();
  const state = editor.createState(parseMarkdown("alpha\n"));
  const region = state.documentIndex.regions[0];

  if (!region) {
    throw new Error("Expected paragraph region");
  }

  const stateAtEnd = editor.setSelection(state, {
    regionId: region.id,
    offset: region.text.length,
  }).state;
  const stateUpdate = editor.deleteBackward(stateAtEnd);

  expect(stateUpdate).not.toBeNull();
  expect(stateUpdate!.animationStarted).toBe(true);
  expect(stateUpdate!.state.animations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "deleted-text-fade",
        regionPath: region.path,
        startOffset: region.text.length - 1,
        text: "a",
      }),
    ]),
  );

  const animation = stateUpdate!.state.animations.find(
    (candidate) => candidate.kind === "deleted-text-fade",
  );
  const stateWithDeletedTextFadeOnly = {
    ...stateUpdate!.state,
    animations: animation ? [animation] : [],
  };

  expect(animation).toBeDefined();
  expect(editor.hasRunningAnimations(stateWithDeletedTextFadeOnly, animation!.startedAt + 10)).toBe(
    true,
  );
  expect(
    editor.hasRunningAnimations(
      stateWithDeletedTextFadeOnly,
      animation!.startedAt + getEditorAnimationDuration(animation!) + 10,
    ),
  ).toBe(false);
});

test("starts an active-block flash animation when selection moves into a different block", () => {
  const editor = createEditor();
  const state = editor.createState(parseMarkdown("alpha\n\nbeta\n"));
  const firstRegion = state.documentIndex.regions[0];
  const secondRegion = state.documentIndex.regions[1];

  if (!firstRegion || !secondRegion) {
    throw new Error("Expected two paragraph regions");
  }

  const stateAtFirstBlock = editor.setSelection(state, {
    regionId: firstRegion.id,
    offset: 0,
  }).state;
  const stateUpdate = editor.setSelection(stateAtFirstBlock, {
    regionId: secondRegion.id,
    offset: 0,
  });

  expect(stateUpdate.animationStarted).toBe(true);
  expect(stateUpdate.state.animations).toEqual([
    expect.objectContaining({
      blockPath: "root.1",
      kind: "active-block-flash",
    }),
  ]);
});

test("starts an active-block flash animation when selection moves into a different table cell", () => {
  const editor = createEditor();
  const state = editor.createState(parseMarkdown("| A | B |\n| - | - |\n| one | two |\n"));
  const firstCell = state.documentIndex.regions[0];
  const secondCell = state.documentIndex.regions[1];

  if (!firstCell || !secondCell) {
    throw new Error("Expected table cell regions");
  }

  expect(firstCell.blockId).toBe(secondCell.blockId);
  expect(firstCell.path).not.toBe(secondCell.path);

  const stateAtFirstCell = editor.setSelection(state, {
    regionId: firstCell.id,
    offset: 0,
  }).state;
  const stateUpdate = editor.setSelection(stateAtFirstCell, {
    regionId: secondCell.id,
    offset: 0,
  });

  expect(stateUpdate.animationStarted).toBe(true);
  expect(stateUpdate.state.animations).toEqual([
    expect.objectContaining({
      blockPath: "root.0",
      kind: "active-block-flash",
    }),
  ]);
});

test("starts a list-marker-pop animation when splitting a list item with insertLineBreak", () => {
  const editor = createEditor();
  const state = editor.createState(parseMarkdown("- alpha\n"));
  const region = state.documentIndex.regions[0];

  if (!region) {
    throw new Error("Expected list item region");
  }

  const stateAtEnd = editor.setSelection(state, {
    regionId: region.id,
    offset: region.text.length,
  }).state;
  const stateUpdate = editor.insertLineBreak(stateAtEnd);

  expect(stateUpdate).not.toBeNull();
  expect(stateUpdate!.animationStarted).toBe(true);
  expect(stateUpdate!.state.animations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "list-marker-pop",
      }),
    ]),
  );
});

test("does not re-trigger list-marker-pop animation when typing inside an existing list item", () => {
  const editor = createEditor();
  const state = editor.createState(parseMarkdown("- alpha\n"));
  const region = state.documentIndex.regions[0];

  if (!region) {
    throw new Error("Expected list item region");
  }

  const stateAtEnd = editor.setSelection(state, {
    regionId: region.id,
    offset: region.text.length,
  }).state;
  const stateUpdate = editor.insertText(stateAtEnd, "b");

  expect(stateUpdate).not.toBeNull();
  expect(
    stateUpdate!.state.animations.some((animation) => animation.kind === "list-marker-pop"),
  ).toBe(false);
});

test("does not start a list-marker-pop animation when splitting a task list item", () => {
  const editor = createEditor();
  const state = editor.createState(parseMarkdown("- [ ] task\n"));
  const region = state.documentIndex.regions[0];

  if (!region) {
    throw new Error("Expected task list item region");
  }

  const stateAtEnd = editor.setSelection(state, {
    regionId: region.id,
    offset: region.text.length,
  }).state;
  const stateUpdate = editor.insertLineBreak(stateAtEnd);

  expect(stateUpdate).not.toBeNull();
  expect(
    stateUpdate!.state.animations.some((animation) => animation.kind === "list-marker-pop"),
  ).toBe(false);
});

test("resolves task-toggle hover targets ahead of text hits", () => {
  const editor = createEditor();
  const state = editor.createState(parseMarkdown("- [ ] Review task\n"));
  const viewport = editor.prepareViewport(state, {
    height: 320,
    top: 0,
    width: 520,
  });
  const line = viewport.layout.lines[0];
  const listItem = state.documentIndex.blocks.find((block) => block.type === "listItem");

  if (!line || !listItem) {
    throw new Error("Expected task list line");
  }

  const hover = editor.resolveHoverTarget(
    state,
    viewport,
    {
      x: line.left + 6,
      y: line.top + line.height / 2,
    },
    [],
  );

  expect(hover).toEqual({
    kind: "task-toggle",
    listItemId: listItem.id,
  });
});

test("updates hovered link urls semantically", () => {
  const editor = createEditor();
  const state = editor.createState(parseMarkdown("Paragraph with [link](https://example.com).\n"));
  const region = state.documentIndex.regions[0];

  if (!region) {
    throw new Error("Expected region");
  }

  const linkRun = region.inlines.find((run) => run.link);

  if (!linkRun?.link) {
    throw new Error("Expected link run");
  }

  const result = editor.updateLink(
    state,
    region.id,
    linkRun.start,
    linkRun.end,
    "https://openai.com",
  );

  expect(result).not.toBeNull();
  expect(serializeMarkdown(editor.getDocument(result!.state))).toBe(
    "Paragraph with [link](https://openai.com).\n",
  );
});

test("removes hovered links while preserving linked text", () => {
  const editor = createEditor();
  const state = editor.createState(parseMarkdown("Paragraph with [link](https://example.com).\n"));
  const region = state.documentIndex.regions[0];

  if (!region) {
    throw new Error("Expected region");
  }

  const linkRun = region.inlines.find((run) => run.link);

  if (!linkRun?.link) {
    throw new Error("Expected link run");
  }

  const result = editor.removeLink(state, region.id, linkRun.start, linkRun.end);

  expect(result).not.toBeNull();
  expect(serializeMarkdown(editor.getDocument(result!.state))).toBe("Paragraph with link.\n");
});
