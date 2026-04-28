import type { ReactNode } from "react";

type DiagnosticsBlockGroupProps = {
  children: ReactNode;
};

export function DiagnosticsBlockGroup({ children }: DiagnosticsBlockGroupProps) {
  return <div style={groupStyle}>{children}</div>;
}

const groupStyle: React.CSSProperties = {
  alignItems: "stretch",
  border: "1.5px solid #ccc",
  borderRadius: 8,
  display: "flex",
  gap: 0,
  padding: 2,
};
