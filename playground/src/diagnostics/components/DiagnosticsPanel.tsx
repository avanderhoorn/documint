import { createContext, useContext, type ReactNode } from "react";

type DiagnosticsPanelProps = {
  children: ReactNode;
  fps?: number;
  onTimeRangeChange: (timeRange: number) => void;
  paintsPerSecond?: number;
  // Latest known virtualization counts. Lives in the titlebar (alongside fps
  // and pps) because it's current document state, not a rolling aggregation
  // — putting it inside the Viewport block alongside count/p50/p99 implied
  // it shared their windowed semantics, which it does not.
  virtualizedBlocks?: { laidOut: number; total: number };
  timeRange: number;
};

const TimeRangeContext = createContext(5);

export function useTimeRange() {
  return useContext(TimeRangeContext);
}

export function DiagnosticsPanel({
  children,
  fps,
  onTimeRangeChange,
  paintsPerSecond,
  virtualizedBlocks,
  timeRange,
}: DiagnosticsPanelProps) {
  return (
    <TimeRangeContext.Provider value={timeRange}>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div style={titleGroupStyle}>
            <span style={titleStyle}>Debug Rendering Flow</span>
            {fps !== undefined && <span style={fpsStyle}>{fps} fps</span>}
            {paintsPerSecond !== undefined && <span style={fpsStyle}>{paintsPerSecond} pps</span>}
            {virtualizedBlocks !== undefined && (
              <span style={fpsStyle} title="Virtualized Blocks (laid out / total)">
                {virtualizedBlocks.laidOut}/{virtualizedBlocks.total} blocks
              </span>
            )}
          </div>
          <div style={headerRightStyle}>
            <label style={sliderLabelStyle}>
              Window
              <input
                max={10}
                min={1}
                onChange={(e) => onTimeRangeChange(Number(e.target.value))}
                step={1}
                style={sliderStyle}
                type="range"
                value={timeRange}
              />
              <span style={sliderValueStyle}>{timeRange}s</span>
            </label>
          </div>
        </div>
        <div style={pipelineStyle}>{children}</div>
      </div>
    </TimeRangeContext.Provider>
  );
}

const panelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 12,
  gap: 8,
  padding: "8px 12px",
};

const headerStyle: React.CSSProperties = {
  alignItems: "center",
  display: "flex",
  justifyContent: "space-between",
};

const titleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
};

const titleGroupStyle: React.CSSProperties = {
  alignItems: "baseline",
  display: "flex",
  gap: 10,
};

const headerRightStyle: React.CSSProperties = {
  alignItems: "center",
  display: "flex",
  gap: 16,
};

const sliderLabelStyle: React.CSSProperties = {
  alignItems: "center",
  color: "#666",
  display: "flex",
  fontSize: 11,
  gap: 6,
};

const sliderStyle: React.CSSProperties = {
  width: 80,
};

const sliderValueStyle: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  minWidth: 20,
};

const pipelineStyle: React.CSSProperties = {
  alignItems: "stretch",
  display: "flex",
  gap: 0,
  height: 85,
  position: "relative",
};

const fpsStyle: React.CSSProperties = {
  color: "#666",
  fontFamily: "SFMono-Regular, Consolas, monospace",
  fontSize: 12,
  fontVariantNumeric: "tabular-nums",
};
