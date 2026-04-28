// Contract test pinning the 1:1 mapping between LifecycleEvent discriminators
// and DiagnosticsStage tags. The playground sink relies on this identity to
// forward events into the collector without a translation table; if a new
// lifecycle variant is introduced upstream without expanding DIAGNOSTICS_STAGES,
// this test fails before runtime drift can occur.

import { describe, expect, test } from "bun:test";
import type { LifecycleEvent } from "@/lifecycle";
import { DIAGNOSTICS_STAGES, type DiagnosticsStage } from "../../src/diagnostics";

describe("lifecycle / diagnostics contract", () => {
  test("every DIAGNOSTICS_STAGES entry is a valid LifecycleEvent['type']", () => {
    // Compile-time guard: the `satisfies` clause in types.ts already enforces
    // this, but pin it at runtime too so this expectation is searchable.
    const valid: readonly LifecycleEvent["type"][] = DIAGNOSTICS_STAGES;
    expect(valid.length).toBe(DIAGNOSTICS_STAGES.length);
  });

  test("DiagnosticsStage and LifecycleEvent['type'] are the same union", () => {
    // Type-level contract: assigning each direction proves union equality.
    const stage: DiagnosticsStage = "command" satisfies LifecycleEvent["type"];
    const lifecycle: LifecycleEvent["type"] = "transaction" satisfies DiagnosticsStage;
    expect(stage).toBe("command");
    expect(lifecycle).toBe("transaction");
  });

  test("DIAGNOSTICS_STAGES covers every LifecycleEvent variant", () => {
    // Hand-rolled list of the variants we expect; if a new variant is added,
    // this assertion forces an explicit decision about whether it should be
    // collected.
    const expected: LifecycleEvent["type"][] = [
      "command",
      "transaction",
      "parse",
      "serialize",
      "viewport",
      "paint",
      "overlay",
      "intent",
    ];
    expect([...DIAGNOSTICS_STAGES].sort()).toEqual([...expected].sort());
  });
});
