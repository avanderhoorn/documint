// Composed debug panel that maps a DiagnosticsSnapshot to the presentational
// component tree. Single horizontal row matching the pipeline topology:
// Intent → Parse → [Index ●→ Transaction] → Viewport → [Paint → Overlay] → Serialize

import { useState } from "react";
import type { DiagnosticsCollector } from "../types";
import { DiagnosticsBlock } from "./DiagnosticsBlock";
import { DiagnosticsBlockGroup } from "./DiagnosticsBlockGroup";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { DiagnosticsPrimary } from "./DiagnosticsPrimary";
import { DiagnosticsSecondaryLine } from "./DiagnosticsSecondaryLine";
import { DiagnosticsSecondaryStack } from "./DiagnosticsSecondaryStack";
import { useDiagnostics } from "../hooks/useDiagnostics";
import { useFps } from "../hooks/useFps";

type DebugPanelProps = {
  collector: DiagnosticsCollector | undefined;
};

export function DebugPanel({ collector }: DebugPanelProps) {
  const [showOverlay, setShowOverlay] = useState(false);
  const [timeRange, setTimeRange] = useState(5);
  const snapshot = useDiagnostics(collector, timeRange);
  const fps = useFps();

  return (
    <DiagnosticsPanel
      timeRange={timeRange}
      onTimeRangeChange={setTimeRange}
      fps={fps}
      paintsPerSecond={snapshot.paintsPerSecond}
      virtualizedBlocks={snapshot.latestViewport}
    >
      {/* Intent */}
      <DiagnosticsBlock label="Intent" minWidth={150} status={snapshot.intent.status}>
        <DiagnosticsPrimary count={snapshot.intent.count} />
        <DiagnosticsSecondaryStack items={snapshot.intent.groupedOps} />
      </DiagnosticsBlock>

      <Connector type="standard" />

      {/* Parse — conditional (dashed border) */}
      <DiagnosticsBlock label="Parse" dashed minWidth={110} status={snapshot.parse.status}>
        <DiagnosticsPrimary
          count={snapshot.parse.count}
          p50={snapshot.parse.p50}
          p99={snapshot.parse.p99}
        />
      </DiagnosticsBlock>

      <Connector type="standard" />

      {/* Command + Transaction grouped */}
      <DiagnosticsBlockGroup>
        <DiagnosticsBlock label="Command" grouped minWidth={150} status={snapshot.command.status}>
          <DiagnosticsPrimary
            count={snapshot.command.count}
            p50={snapshot.command.p50}
            p99={snapshot.command.p99}
          />
          <DiagnosticsSecondaryLine
            items={[
              { abbr: "RB", value: snapshot.command.replaceBlock, label: "Replace Block" },
              { abbr: "RR", value: snapshot.command.replaceRoot, label: "Replace Root" },
              { abbr: "RRR", value: snapshot.command.replaceRootRange, label: "Replace Root Range" },
              { abbr: "RST", value: snapshot.command.replaceSelectionText, label: "Replace Selection Text" },
            ]}
          />
        </DiagnosticsBlock>

        <Connector type="dot" />

        <DiagnosticsBlock label="Transaction" dashed grouped minWidth={120} status={snapshot.transaction.status}>
          <DiagnosticsPrimary
            count={snapshot.transaction.count}
            p50={snapshot.transaction.p50}
            p99={snapshot.transaction.p99}
          />
        </DiagnosticsBlock>
      </DiagnosticsBlockGroup>

      <Connector type="standard" />

      {/* Viewport */}
      <DiagnosticsBlock label="Viewport" minWidth={110} status={snapshot.viewport.status}>
        <DiagnosticsPrimary
          count={snapshot.viewport.count}
          p50={snapshot.viewport.p50}
          p99={snapshot.viewport.p99}
        />
      </DiagnosticsBlock>

      <Connector type="standard" />

      {/* Paint + Overlay grouped */}
      <DiagnosticsBlockGroup>
        <DiagnosticsBlock label="Paint" grouped minWidth={140} status={snapshot.paint.status}>
          <DiagnosticsPrimary
            count={snapshot.paint.count}
            p50={snapshot.paint.p50}
            p99={snapshot.paint.p99}
          />
          <DiagnosticsSecondaryLine
            items={[
              { abbr: "RR", value: snapshot.paint.relayoutRepaint, label: "Relayout + Repaint" },
              { abbr: "R", value: snapshot.paint.repaintOnly, label: "Repaint Only" },
            ]}
          />
          <button
            onClick={() => setShowOverlay((prev) => !prev)}
            style={overlayToggleStyle}
            title={showOverlay ? "Hide Overlay" : "Show Overlay"}
            type="button"
          >
            <span style={{ color: "#1a6f8a", fontSize: 14 }}>{showOverlay ? "◯" : "●"}</span>
          </button>
        </DiagnosticsBlock>

        {showOverlay && (
          <>
            <Connector type="space" />
            <DiagnosticsBlock label="Overlay" dashed grouped minWidth={110} status={snapshot.overlay.status}>
              <DiagnosticsPrimary
                count={snapshot.overlay.count}
                p50={snapshot.overlay.p50}
                p99={snapshot.overlay.p99}
              />
            </DiagnosticsBlock>
          </>
        )}
      </DiagnosticsBlockGroup>

      <Connector type="standard" />

      {/* Serialize — always at end */}
      <DiagnosticsBlock label="Serialize" minWidth={100} status={snapshot.serialize.status}>
        <DiagnosticsPrimary
          count={snapshot.serialize.count}
          p50={snapshot.serialize.p50}
          p99={snapshot.serialize.p99}
        />
        <DiagnosticsSecondaryLine
          items={[{ abbr: "D", value: snapshot.serialize.deltaChars, label: "Output Length Delta" }]}
        />
      </DiagnosticsBlock>
    </DiagnosticsPanel>
  );
}

// Inline connector between adjacent cards in the horizontal row.
function Connector({ type }: { type: "standard" | "dot" | "dashed" | "space" }) {
  if (type === "space") {
    return <div style={{ ...connectorStyle, width: 28 }} />;
  }

  if (type === "dot") {
    return (
      <div style={connectorStyle}>
        <svg width="30" height="12" viewBox="0 0 30 12" style={{ display: "block" }}>
          <circle cx="4" cy="6" r="3" fill="#1a6f8a" />
          <line x1="9" y1="6" x2="24" y2="6" stroke="#bbb" strokeWidth="1" strokeDasharray="3 2" />
          <polygon points="24,3 30,6 24,9" fill="#bbb" />
        </svg>
      </div>
    );
  }

  const isDashed = type === "dashed";

  return (
    <div style={connectorStyle}>
      <svg width="24" height="12" viewBox="0 0 24 12" style={{ display: "block" }}>
        <line
          x1="0"
          y1="6"
          x2="18"
          y2="6"
          stroke="#bbb"
          strokeWidth="1"
          strokeDasharray={isDashed ? "3 2" : "none"}
        />
        <polygon points="18,3 24,6 18,9" fill="#bbb" />
      </svg>
    </div>
  );
}

const connectorStyle: React.CSSProperties = {
  alignItems: "center",
  alignSelf: "center",
  display: "flex",
  flexShrink: 0,
  padding: "0 2px",
};

const overlayToggleStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  lineHeight: 1,
  padding: "2px 0",
  position: "absolute",
  right: 6,
  top: 6,
};
