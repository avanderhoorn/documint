// Public surface of the diagnostics subsystem. Anything not exported here is
// internal — including the panel component primitives, the snapshot/aggregation
// helpers, and the React hooks. Tests that need internal pieces deep-import
// from `./components`, `./snapshot`, `./aggregation`, etc.

export { createDiagnosticsCollector, DIAGNOSTICS_BUFFER_CAPACITY } from "./collector";
export { DIAGNOSTICS_STAGES } from "./types";
export type { DiagnosticsCollector, DiagnosticsStage } from "./types";
export { DebugPanel } from "./components/DebugPanel";
