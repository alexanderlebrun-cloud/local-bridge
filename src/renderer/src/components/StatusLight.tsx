import React from "react";

type Color = "green" | "yellow" | "red" | "gray";

interface Props {
  color: Color;
  label?: string;
  size?: number;
}

export default function StatusLight({ color, label, size = 8 }: Props): React.ReactElement {
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      <span
        className={`status-dot ${color}`}
        style={{ width: size, height: size }}
      />
      {label && (
        <span className="text-xs text-muted">{label}</span>
      )}
    </span>
  );
}
