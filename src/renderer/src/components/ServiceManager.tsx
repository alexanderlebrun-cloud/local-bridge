import React, { useEffect, useState, useCallback, useRef } from "react";
import StatusLight from "./StatusLight";
import LogPane, { type LogLine } from "./LogPane";

import type { ProcessStatus, AppSettings } from "../bridge";

interface ProcessLogEntry {
  id: "runLocal" | "ngrok";
  line: string;
  ts: number;
}

export default function ServiceManager(): React.ReactElement {
  const [settings, setSettingsState] = useState<AppSettings>({
    runLocalPath: "",
    ngrokPath: "",
    ngrokPort: 8001,
    simulators: [],
  });
  const [statuses, setStatuses] = useState<Record<string, ProcessStatus>>({});
  const [runLocalLogs, setRunLocalLogs] = useState<LogLine[]>([]);
  const [ngrokLogs, setNgrokLogs] = useState<LogLine[]>([]);
  const [ngrokUrl, setNgrokUrl] = useState<string>("");
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Initial load */
  useEffect(() => {
    window.bridge.settings.get().then((s) => {
      setSettingsState(s);
    });
    window.bridge.process.getStatuses().then((list) => {
      const map: Record<string, ProcessStatus> = {};
      for (const s of list) map[s.id] = s;
      setStatuses(map);
    });
  }, []);

  /* Subscribe to events */
  useEffect(() => {
    const unsubs = [
      window.bridge.process.onStatus((raw) => {
        const s = raw as ProcessStatus;
        setStatuses((prev) => ({ ...prev, [s.id]: s }));
      }),
      window.bridge.process.onLog((raw) => {
        const e = raw as ProcessLogEntry;
        const line: LogLine = { text: e.line, ts: e.ts };
        if (e.id === "runLocal") {
          setRunLocalLogs((prev) => [...prev, line]);
        } else {
          setNgrokLogs((prev) => [...prev, line]);
        }
      }),
      window.bridge.process.onNgrokUrl((url) => {
        setNgrokUrl(url);
      }),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, []);

  const persistSettings = useCallback(async (partial: Partial<AppSettings>) => {
    const updated = await window.bridge.settings.set(partial);
    setSettingsState(updated);
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2000);
  }, []);

  const pickFile = useCallback(async (field: "runLocalPath" | "ngrokPath") => {
    const title = field === "runLocalPath" ? "Select run-local.sh" : "Select ngrok binary";
    const path = await window.bridge.dialog.openFile({
      title,
      filters: field === "runLocalPath"
        ? [{ name: "Shell Script", extensions: ["sh", "*"] }]
        : [{ name: "Executable", extensions: ["*"] }],
    });
    if (path) {
      await persistSettings({ [field]: path });
    }
  }, [persistSettings]);

  const rlStatus = statuses["runLocal"];
  const ngStatus = statuses["ngrok"];

  const rlColor = rlStatus?.error ? "red" : rlStatus?.running ? "green" : "gray";
  const ngColor = ngStatus?.error ? "red" : ngStatus?.running ? (ngrokUrl ? "green" : "yellow") : "gray";

  const clearLogs = (id: "runLocal" | "ngrok") => {
    if (id === "runLocal") setRunLocalLogs([]);
    else setNgrokLogs([]);
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden p-12" style={{ gap: 12 }}>

      {/* ── Setup row ─────────────────────────────────────────── */}
      <div className="panel" style={{ flexShrink: 0 }}>
        <div className="panel-header">
          Setup
          {saved && <span className="badge badge-teal" style={{ marginLeft: "auto" }}>Saved</span>}
        </div>
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <PathRow
            label="run-local.sh"
            value={settings.runLocalPath}
            placeholder="Not configured — click Browse"
            onBrowse={() => pickFile("runLocalPath")}
            onChange={(v) => persistSettings({ runLocalPath: v })}
          />
          <PathRow
            label="ngrok binary"
            value={settings.ngrokPath}
            placeholder="Leave blank to use 'ngrok' from PATH"
            onBrowse={() => pickFile("ngrokPath")}
            onChange={(v) => persistSettings({ ngrokPath: v })}
          />
          <div className="flex items-center gap-8">
            <label className="text-xs text-muted" style={{ width: 100 }}>Analyzer port</label>
            <input
              type="number"
              value={settings.ngrokPort}
              min={1024}
              max={65535}
              style={{ width: 80 }}
              onChange={(e) => persistSettings({ ngrokPort: Number(e.target.value) })}
            />
            <span className="text-xs text-muted">(passed to ngrok http)</span>
          </div>
        </div>
      </div>

      {/* ── Global controls ────────────────────────────────────── */}
      <div className="flex items-center gap-8" style={{ flexShrink: 0 }}>
        <button
          className="btn btn-primary"
          onClick={() => {
            window.bridge.process.start("runLocal");
            window.bridge.process.start("ngrok");
          }}
        >
          ▶ Start All
        </button>
        <button
          className="btn btn-danger"
          onClick={() => window.bridge.process.stopAll()}
        >
          ■ Stop All
        </button>
        <div className="flex-1" />
        <StatusLight color={rlColor} label="Python Analyzer" />
        <StatusLight color={ngColor} label="ngrok Tunnel" />
      </div>

      {/* ── Process panels ─────────────────────────────────────── */}
      <div className="flex flex-1 gap-8 overflow-hidden" style={{ minHeight: 0 }}>
        <ProcessPanel
          id="runLocal"
          label="Python Analyzer"
          subtitle="whisper + audio analysis"
          status={rlStatus}
          color={rlColor}
          logs={runLocalLogs}
          onStart={() => window.bridge.process.start("runLocal")}
          onStop={() => window.bridge.process.stop("runLocal")}
          onClear={() => clearLogs("runLocal")}
        />
        <ProcessPanel
          id="ngrok"
          label="ngrok Tunnel"
          subtitle={`http → localhost:${settings.ngrokPort}`}
          status={ngStatus}
          color={ngColor}
          logs={ngrokLogs}
          ngrokUrl={ngrokUrl}
          onStart={() => window.bridge.process.start("ngrok")}
          onStop={() => window.bridge.process.stop("ngrok")}
          onClear={() => clearLogs("ngrok")}
        />
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

interface PathRowProps {
  label: string;
  value: string;
  placeholder: string;
  onBrowse: () => void;
  onChange: (v: string) => void;
}

function PathRow({ label, value, placeholder, onBrowse, onChange }: PathRowProps): React.ReactElement {
  return (
    <div className="flex items-center gap-8">
      <label className="text-xs text-muted" style={{ width: 100, flexShrink: 0 }}>{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        style={{ flex: 1, fontSize: 11 }}
        onChange={(e) => onChange(e.target.value)}
      />
      <button className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={onBrowse}>
        Browse…
      </button>
    </div>
  );
}

interface ProcessPanelProps {
  id: "runLocal" | "ngrok";
  label: string;
  subtitle: string;
  status?: ProcessStatus;
  color: "green" | "yellow" | "red" | "gray";
  logs: LogLine[];
  ngrokUrl?: string;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
}

function ProcessPanel({
  label, subtitle, status, color, logs, ngrokUrl,
  onStart, onStop, onClear,
}: ProcessPanelProps): React.ReactElement {
  const running = status?.running ?? false;

  return (
    <div className="panel flex flex-col flex-1 overflow-hidden">
      <div className="panel-header">
        <StatusLight color={color} size={8} />
        <span>{label}</span>
        <span className="text-xs text-muted font-600" style={{ fontWeight: 400 }}>
          {subtitle}
        </span>
        {status?.pid && (
          <span className="badge badge-gray" style={{ marginLeft: 4 }}>PID {status.pid}</span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            className="btn btn-icon"
            onClick={onClear}
            title="Clear log"
          >
            ⊘
          </button>
          {running ? (
            <button className="btn btn-danger" style={{ padding: "3px 10px" }} onClick={onStop}>Stop</button>
          ) : (
            <button className="btn btn-primary" style={{ padding: "3px 10px" }} onClick={onStart}>Start</button>
          )}
        </div>
      </div>

      {ngrokUrl && (
        <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)" }}>
          <div className="url-badge">
            <span>🔗</span>
            <span className="flex-1 truncate">{ngrokUrl}</span>
            <button
              className="btn btn-icon"
              style={{ padding: "2px 6px", fontSize: 10 }}
              onClick={() => navigator.clipboard?.writeText(ngrokUrl)}
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {status?.error && (
        <div style={{ padding: "4px 10px", background: "#2d0a0e", borderBottom: "1px solid var(--rose-dim)" }}>
          <span className="text-red text-xs">⚠ {status.error}</span>
        </div>
      )}

      <LogPane lines={logs} style={{ flex: 1 }} />
    </div>
  );
}
