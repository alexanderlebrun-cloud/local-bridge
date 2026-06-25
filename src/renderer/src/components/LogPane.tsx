import React, { useEffect, useRef } from "react";

export interface LogLine {
  text: string;
  ts: number;
}

interface Props {
  lines: LogLine[];
  maxLines?: number;
  autoScroll?: boolean;
  style?: React.CSSProperties;
}

function classifyLine(line: string): string {
  const l = line.toLowerCase();
  if (l.startsWith("[bridge]")) return "bridge";
  if (l.includes("error") || l.includes("traceback") || l.includes("exception")) return "error";
  if (l.includes("warn")) return "warn";
  if (l.includes("✓") || l.includes("success") || l.includes("started") || l.includes("listening")) return "success";
  if (l.includes("info") || l.includes("url:") || l.includes("forwarding")) return "info";
  return "";
}

function fmtTs(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
}

export default function LogPane({ lines, maxLines = 300, autoScroll = true, style }: Props): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const visible = lines.slice(-maxLines);

  useEffect(() => {
    if (autoScroll && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [lines.length, autoScroll]);

  return (
    <div ref={ref} className="log-pane" style={style}>
      {visible.length === 0 && (
        <span className="text-muted">— no output yet —</span>
      )}
      {visible.map((l, i) => (
        <span key={i} className={`log-line ${classifyLine(l.text)}`}>
          <span style={{ color: "var(--text-muted)", userSelect: "none" }}>{fmtTs(l.ts)} </span>
          {l.text}{"\n"}
        </span>
      ))}
    </div>
  );
}
