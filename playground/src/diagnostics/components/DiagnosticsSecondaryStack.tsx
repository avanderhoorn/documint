type StackItem = {
  count: number;
  label: string;
};

type DiagnosticsSecondaryStackProps = {
  items: StackItem[];
  maxVisibleRows?: number;
};

const LINE_HEIGHT = 16;

export function DiagnosticsSecondaryStack({
  items,
  maxVisibleRows = 2,
}: DiagnosticsSecondaryStackProps) {
  const maxHeight = maxVisibleRows * LINE_HEIGHT;

  return (
    <div
      style={{
        ...containerStyle,
        height: maxHeight,
        maskImage:
          items.length > maxVisibleRows
            ? "linear-gradient(to bottom, black 60%, transparent 100%)"
            : undefined,
        WebkitMaskImage:
          items.length > maxVisibleRows
            ? "linear-gradient(to bottom, black 60%, transparent 100%)"
            : undefined,
      }}
    >
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`} style={itemStyle}>
          <span style={countStyle}>{item.count}x</span> {item.label}
        </div>
      ))}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  color: "#666",
  fontSize: 11,
  lineHeight: `${LINE_HEIGHT}px`,
  overflow: "hidden",
};

const itemStyle: React.CSSProperties = {
  whiteSpace: "nowrap",
};

const countStyle: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
};
