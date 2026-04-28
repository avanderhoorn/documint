type ConnectorType = "standard" | "conditional" | "fork" | "branch";

type DiagnosticsConnectorProps = {
  from: string;
  to: string;
  type: ConnectorType;
};

// Connectors are rendered as an SVG overlay that positions arrows between
// DiagnosticsBlock elements via their `data-diagnostics-block` attributes.
// The SVG is absolutely positioned within the panel's CSS Grid so it doesn't
// affect layout flow. Endpoint resolution happens at paint time via DOM
// measurement — the `from`/`to` props reference block labels.
export function DiagnosticsConnector({ from, to, type }: DiagnosticsConnectorProps) {
  return (
    <svg
      data-connector-from={from}
      data-connector-to={to}
      data-connector-type={type}
      style={svgStyle}
    >
      {/* Actual path rendering is deferred to the playground integration
          phase, where DOM measurement is available for endpoint resolution.
          The SVG element is placed now so the composition API is exercised. */}
    </svg>
  );
}

const svgStyle: React.CSSProperties = {
  height: 0,
  left: 0,
  overflow: "visible",
  pointerEvents: "none",
  position: "absolute",
  top: 0,
  width: 0,
};
