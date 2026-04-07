import { createDocumentEditor } from "@/editor/model/document-editor";
import { createCanvasRenderCache } from "@/editor/render/cache";
import { createCanvasViewportLayout } from "@/editor/layout/viewport";
import { parseMarkdown } from "@/markdown";
import type { BenchmarkBudgetTree, BenchmarkRecord } from "./shared";
import { runBenchmark } from "./shared";

export function createLayoutBenchmarks(
  budgets: BenchmarkBudgetTree["layout"],
  fixtures: {
    hugeMarkdown: string;
    longMarkdown: string;
    mediumMarkdown: string;
    xlargeMarkdown: string;
  },
): BenchmarkRecord[] {
  const longRuntime = createDocumentEditor(parseMarkdown(fixtures.longMarkdown));
  const xlargeRuntime = createDocumentEditor(parseMarkdown(fixtures.xlargeMarkdown));
  const hugeRuntime = createDocumentEditor(parseMarkdown(fixtures.hugeMarkdown));
  const renderCache = createCanvasRenderCache();
  const scrollViewport = {
    height: 720,
    overscan: 720,
  };
  const scrollStepTop = 720;
  const scrollOffsets = [0, 720, 1440, 2160, 2880, 3600];

  return [
    runBenchmark(
      "layout_canvas",
      20,
      budgets.canvas,
      () =>
        void createCanvasViewportLayout(
          longRuntime,
          {
            width: 420,
          },
          {
            height: 720,
            overscan: 720,
            top: 0,
          },
          [],
          renderCache,
        ),
    ),
    runBenchmark(
      "layout_canvas_xlarge",
      10,
      budgets.canvas_xlarge,
      () =>
        void createCanvasViewportLayout(
          xlargeRuntime,
          {
            width: 420,
          },
          {
            height: 720,
            overscan: 720,
            top: 0,
          },
          [],
          renderCache,
        ),
    ),
    runBenchmark(
      "layout_canvas_huge",
      6,
      budgets.canvas_huge,
      () =>
        void createCanvasViewportLayout(
          hugeRuntime,
          {
            width: 420,
          },
          {
            height: 720,
            overscan: 720,
            top: 0,
          },
          [],
          renderCache,
        ),
    ),
    runBenchmark(
      "layout_scroll",
      20,
      budgets.scroll,
      () => {
        for (const top of scrollOffsets) {
          void createCanvasViewportLayout(
            longRuntime,
            {
              width: 420,
            },
            {
              ...scrollViewport,
              top,
            },
            [],
            renderCache,
          );
        }
      },
    ),
    runBenchmark(
      "layout_scroll_step",
      50,
      budgets.scroll_step,
      () =>
        void createCanvasViewportLayout(
          longRuntime,
          {
            width: 420,
          },
          {
            ...scrollViewport,
            top: scrollStepTop,
          },
          [],
          renderCache,
        ),
    ),
    runBenchmark(
      "layout_scroll_xlarge",
      10,
      budgets.scroll_xlarge,
      () => {
        for (const top of scrollOffsets) {
          void createCanvasViewportLayout(
            xlargeRuntime,
            {
              width: 420,
            },
            {
              ...scrollViewport,
              top,
            },
            [],
            renderCache,
          );
        }
      },
    ),
    runBenchmark(
      "layout_scroll_step_xlarge",
      20,
      budgets.scroll_step_xlarge,
      () =>
        void createCanvasViewportLayout(
          xlargeRuntime,
          {
            width: 420,
          },
          {
            ...scrollViewport,
            top: scrollStepTop,
          },
          [],
          renderCache,
        ),
    ),
    runBenchmark(
      "layout_scroll_huge",
      6,
      budgets.scroll_huge,
      () => {
        for (const top of scrollOffsets) {
          void createCanvasViewportLayout(
            hugeRuntime,
            {
              width: 420,
            },
            {
              ...scrollViewport,
              top,
            },
            [],
            renderCache,
          );
        }
      },
    ),
    runBenchmark(
      "layout_scroll_step_huge",
      10,
      budgets.scroll_step_huge,
      () =>
        void createCanvasViewportLayout(
          hugeRuntime,
          {
            width: 420,
          },
          {
            ...scrollViewport,
            top: scrollStepTop,
          },
          [],
          renderCache,
        ),
    ),
  ];
}
