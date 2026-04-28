import type { ReactNode } from "react";

type DiagnosticsBlockProps = {
  children?: ReactNode;
  dashed?: boolean;
  grouped?: boolean;
  hidden?: boolean;
  label: string;
  minWidth?: number;
  status?: "active" | "idle";
};

export function DiagnosticsBlock({
  children,
  dashed = false,
  grouped = false,
  hidden = false,
  label,
  minWidth = 70,
  status = "active",
}: DiagnosticsBlockProps) {
  if (hidden) return null;

  const isActive = status === "active";
  const borderWidth = isActive ? 2 : 1.5;
  // Compensate for thicker border so content doesn't shift
  const paddingAdjust = isActive ? 0 : 0.5;

  // Standalone blocks get extra vertical padding to align content with
  // grouped blocks (which have the group's border + padding wrapping them).
  const verticalPad = grouped ? 2 : 6;

  const style: React.CSSProperties = {
    ...cardStyle,
    background: isActive ? "rgba(14, 165, 233, 0.06)" : "transparent",
    borderColor: isActive ? "rgba(14, 165, 233, 0.35)" : "#ddd",
    borderStyle: dashed ? "dashed" : "solid",
    borderWidth,
    minWidth,
    padding: `${verticalPad + paddingAdjust}px ${12 + paddingAdjust}px`,
  };

  return (
    <div data-diagnostics-block={label} style={style}>
      <div style={labelStyle}>{label}</div>
      <div style={contentStyle}>{children}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  alignItems: "center",
  borderRadius: 8,
  display: "flex",
  flexDirection: "column",
  gap: 3,
  minWidth: 70,
  position: "relative",
};

const labelStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
};

const contentStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};
