type SecondaryLineItem = {
  abbr: string;
  label: string;
  value: string | number;
};

type DiagnosticsSecondaryLineProps = {
  items: SecondaryLineItem[];
};

export function DiagnosticsSecondaryLine({ items }: DiagnosticsSecondaryLineProps) {
  return (
    <div style={rowStyle}>
      {items.map((item, i) => (
        <span key={item.abbr} style={itemStyle}>
          {i > 0 && <span style={separatorStyle}> – </span>}
          <span title={item.label} style={abbrStyle}>
            {item.abbr}
          </span>{" "}
          {item.value}
        </span>
      ))}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  color: "#666",
  fontSize: 11,
  fontVariantNumeric: "tabular-nums",
  textAlign: "center",
  whiteSpace: "nowrap",
};

const itemStyle: React.CSSProperties = {
  display: "inline",
};

const separatorStyle: React.CSSProperties = {
  color: "#999",
};

const abbrStyle: React.CSSProperties = {
  fontWeight: 600,
};
