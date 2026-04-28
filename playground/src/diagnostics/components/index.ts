// Internal barrel for the panel component primitives. These are construction
// blocks for `DebugPanel`, not part of the public diagnostics API. The public
// barrel (`../index.ts`) re-exports only `DebugPanel`. Tests that exercise
// the primitives in isolation deep-import from this file.

export { DebugPanel } from "./DebugPanel";
export { DiagnosticsBlock } from "./DiagnosticsBlock";
export { DiagnosticsBlockGroup } from "./DiagnosticsBlockGroup";
export { DiagnosticsConnector } from "./DiagnosticsConnector";
export { DiagnosticsPanel, useTimeRange } from "./DiagnosticsPanel";
export { DiagnosticsPrimary } from "./DiagnosticsPrimary";
export { DiagnosticsSecondaryLine } from "./DiagnosticsSecondaryLine";
export { DiagnosticsSecondaryStack } from "./DiagnosticsSecondaryStack";
