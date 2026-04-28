type DiagnosticsPrimaryProps = {
  count: number;
  p50?: number;
  p99?: number;
};

export function DiagnosticsPrimary({ count, p50, p99 }: DiagnosticsPrimaryProps) {
  const hasTiming = p50 !== undefined && p99 !== undefined;
  const hasData = count > 0 && hasTiming;

  return (
    <div style={rowStyle}>
      <span style={countStyle}>{count}</span>
      {hasTiming && (
        <span style={timingContainerStyle}>
          <span style={timingStyle}>{hasData ? formatMs(p50!) : "–\u2009ms"}</span>
          <span style={timingStyle}>{hasData ? formatMs(p99!) : "–\u2009ms"}</span>
        </span>
      )}
    </div>
  );
}

function formatMs(ms: number): string {
  return ms < 0.1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(1)}ms`;
}

const rowStyle: React.CSSProperties = {
  alignItems: "center",
  display: "flex",
  gap: 6,
  justifyContent: "center",
};

const countStyle: React.CSSProperties = {
  fontSize: 20,
  fontVariantNumeric: "tabular-nums",
  fontWeight: 700,
  lineHeight: 1,
};

const timingContainerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
};

const timingStyle: React.CSSProperties = {
  color: "#666",
  fontSize: 11,
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1.3,
  whiteSpace: "nowrap",
};
