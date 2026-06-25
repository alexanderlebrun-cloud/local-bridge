import React, { useState, useEffect } from "react";
import ServiceManager from "./components/ServiceManager";
import SimulatorTab from "./components/SimulatorTab";

type Tab = "service" | "simulator";

type UpdatePhase = "available" | "downloading" | "ready" | "error" | "not-available";

interface UpdateInfo {
  version?: string;
}

interface UpdateStatus {
  phase: UpdatePhase;
  info?: UpdateInfo;
  progress?: { percent: number };
  message?: string;
}

export default function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>("service");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const unsub = window.bridge.updater.onStatus((raw) => {
      setUpdateStatus(raw as UpdateStatus);
      setChecking(false);
    });
    return unsub;
  }, []);

  function handleInstall(): void {
    window.bridge.updater.install();
  }

  async function handleCheckForUpdates(): Promise<void> {
    setChecking(true);
    setUpdateStatus(null);
    await window.bridge.updater.check();
  }

  function renderUpdateBanner(): React.ReactElement | null {
    if (!updateStatus) return null;

    let text = "";
    let actionLabel: string | null = null;

    switch (updateStatus.phase) {
      case "available":
        text = "A new version is downloading…";
        break;
      case "downloading": {
        const pct = updateStatus.progress?.percent ?? 0;
        text = `Downloading update — ${Math.round(pct)}%`;
        break;
      }
      case "ready": {
        const version = updateStatus.info?.version;
        text = version
          ? `v${version} ready — restart to install`
          : "Update ready — restart to install";
        actionLabel = "Restart Now";
        break;
      }
      case "not-available":
        text = "You're on the latest version.";
        break;
      case "error":
        text = `Update check failed: ${updateStatus.message ?? "unknown error"}`;
        break;
      default:
        return null;
    }

    const isReady = updateStatus.phase === "ready";
    const isError = updateStatus.phase === "error";
    const isNotAvailable = updateStatus.phase === "not-available";

    const bgColor = isError ? "#4b1b1b" : isReady ? "#1a3a2a" : isNotAvailable ? "#1a2a1a" : "#1a2a3a";
    const textColor = isError ? "#f87171" : isReady ? "#4ade80" : isNotAvailable ? "#86efac" : "#93c5fd";
    const borderColor = isError ? "#7f1d1d" : isReady ? "#166534" : isNotAvailable ? "#14532d" : "#1e3a5f";

    return (
      <div
        className="update-banner"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 14px",
          fontSize: "12px",
          background: bgColor,
          color: textColor,
          borderBottom: `1px solid ${borderColor}`,
          gap: "8px",
        }}
      >
        <span>{text}</span>
        {actionLabel && (
          <button
            onClick={handleInstall}
            style={{
              background: "#22c55e",
              color: "#000",
              border: "none",
              borderRadius: "4px",
              padding: "3px 10px",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {actionLabel}
          </button>
        )}
        {(isError || isNotAvailable) && (
          <button
            onClick={() => setUpdateStatus(null)}
            style={{
              background: "transparent",
              color: textColor,
              border: "none",
              cursor: "pointer",
              fontSize: "14px",
              lineHeight: 1,
              padding: "0 2px",
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <div className="titlebar">
        <span className="titlebar-text">CWOS LOCAL BRIDGE</span>
        <button
          onClick={handleCheckForUpdates}
          disabled={checking}
          style={{
            WebkitAppRegion: "no-drag" as React.CSSProperties["WebkitAppRegion"],
            marginLeft: "auto",
            background: "transparent",
            border: "1px solid var(--border, #2a2d3a)",
            borderRadius: "4px",
            color: checking ? "#64748b" : "#94a3b8",
            cursor: checking ? "default" : "pointer",
            fontSize: "11px",
            padding: "3px 10px",
            whiteSpace: "nowrap",
          }}
          aria-label="Check for updates"
        >
          {checking ? "Checking…" : "Check for updates"}
        </button>
      </div>

      {renderUpdateBanner()}

      <div className="tab-bar">
        <button
          className={`tab${activeTab === "service" ? " active" : ""}`}
          onClick={() => setActiveTab("service")}
        >
          Service Manager
        </button>
        <button
          className={`tab${activeTab === "simulator" ? " active" : ""}`}
          onClick={() => setActiveTab("simulator")}
        >
          Show Control Simulator
        </button>
      </div>

      <div className="tab-content">
        {activeTab === "service"   && <ServiceManager />}
        {activeTab === "simulator" && <SimulatorTab />}
      </div>
    </div>
  );
}
