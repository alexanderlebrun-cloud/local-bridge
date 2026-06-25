import React, { useEffect, useState, useCallback, useRef } from "react";
import StatusLight from "./StatusLight";
import LogPane, { type LogLine } from "./LogPane";

import type { SimulatorProfile, SimulatorConfig, SimulatorPreset, OscEvent, AppSettings } from "../bridge";

function genId(): string {
  return `sim-${Math.random().toString(36).slice(2, 9)}`;
}

export default function SimulatorTab(): React.ReactElement {
  const [profiles, setProfiles] = useState<SimulatorProfile[]>([]);
  const [configs, setConfigs] = useState<SimulatorConfig[]>([]);
  const [presets, setPresets] = useState<SimulatorPreset[]>([]);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [eventMap, setEventMap] = useState<Record<string, LogLine[]>>({});
  const [selectedSim, setSelectedSim] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /* Preset UI state */
  const [showPresets, setShowPresets] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");

  /* Inline rename state */
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  /* Drag-to-reorder state */
  const draggedId = useRef<string | null>(null);
  const dragOverId = useRef<string | null>(null);

  /* Initial load */
  useEffect(() => {
    window.bridge.sim.profiles().then(setProfiles);
    window.bridge.settings.get().then((s) => {
      setConfigs(s.simulators ?? []);
    });
    window.bridge.sim.list().then((ids) => {
      setRunning(new Set(ids));
    });
    window.bridge.preset.list().then(setPresets);
  }, []);

  /* Listen for tray-initiated preset loads */
  useEffect(() => {
    const unsub = window.bridge.settings.onUpdated((raw) => {
      const s = raw as AppSettings & { runningIds?: string[] };
      setConfigs(s.simulators ?? []);
      setSelectedSim(null);
      /* All simulators were stopped on the main side before the push */
      setRunning(new Set(s.runningIds ?? []));
    });
    return unsub;
  }, []);

  /* Subscribe to simulator events */
  useEffect(() => {
    const unsubs = [
      window.bridge.sim.onEvent((raw) => {
        const ev = raw as OscEvent;
        const line: LogLine = { text: formatOscEvent(ev), ts: ev.ts };
        setEventMap((prev) => ({
          ...prev,
          [ev.simId]: [...(prev[ev.simId] ?? []), line],
        }));
      }),
      window.bridge.sim.onError((raw) => {
        const ev = raw as { simId: string; error: string };
        setErrors((prev) => ({ ...prev, [ev.simId]: ev.error }));
        setRunning((prev) => {
          const next = new Set(prev);
          next.delete(ev.simId);
          return next;
        });
      }),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, []);

  const saveConfigs = useCallback(async (next: SimulatorConfig[]) => {
    setConfigs(next);
    await window.bridge.settings.set({ simulators: next });
  }, []);

  const addSim = useCallback((profileId: string) => {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;
    const cfg: SimulatorConfig = {
      id: genId(),
      name: `${profile.name}`,
      profileId,
      port: profile.defaultPort,
      latencyMs: 5,
      errorRate: 0,
      enabled: false,
      discoverable: true,
    };
    saveConfigs([...configs, cfg]);
    setSelectedSim(cfg.id);
    setShowAddForm(false);
  }, [profiles, configs, saveConfigs]);

  const removeSim = useCallback(async (id: string) => {
    if (running.has(id)) {
      await window.bridge.sim.stop(id);
      setRunning((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
    saveConfigs(configs.filter((c) => c.id !== id));
    if (selectedSim === id) setSelectedSim(null);
  }, [configs, running, selectedSim, saveConfigs]);

  const toggleStart = useCallback(async (cfg: SimulatorConfig) => {
    if (running.has(cfg.id)) {
      await window.bridge.sim.stop(cfg.id);
      setRunning((prev) => { const n = new Set(prev); n.delete(cfg.id); return n; });
    } else {
      const res = await window.bridge.sim.start(cfg);
      if (res.ok) {
        setRunning((prev) => new Set([...prev, cfg.id]));
        setErrors((prev) => { const n = { ...prev }; delete n[cfg.id]; return n; });
      } else {
        setErrors((prev) => ({ ...prev, [cfg.id]: res.error ?? "Failed to start" }));
      }
    }
  }, [running]);

  const updateConfig = useCallback(async (id: string, patch: Partial<SimulatorConfig>) => {
    const next = configs.map((c) => c.id === id ? { ...c, ...patch } : c);
    await saveConfigs(next);
  }, [configs, saveConfigs]);

  const duplicateSim = useCallback((cfg: SimulatorConfig) => {
    const copy: SimulatorConfig = {
      ...cfg,
      id: genId(),
      name: `${cfg.name} (copy)`,
      port: cfg.port + 1,
      enabled: false,
    };
    const next = [...configs, copy];
    saveConfigs(next);
    setSelectedSim(copy.id);
  }, [configs, saveConfigs]);

  /* ── Preset actions ─────────────────────────────────────────────── */

  const isDuplicateSaveName = presetName.trim() !== "" &&
    presets.some((p) => p.name.trim().toLowerCase() === presetName.trim().toLowerCase());

  const isDuplicateRenameName = renamingId !== null && renameValue.trim() !== "" &&
    presets.some((p) => p.id !== renamingId && p.name.trim().toLowerCase() === renameValue.trim().toLowerCase());

  const handleSavePreset = useCallback(async () => {
    if (!presetName.trim()) return;
    if (presets.some((p) => p.name.trim().toLowerCase() === presetName.trim().toLowerCase())) return;
    const saved = await window.bridge.preset.save(presetName.trim());
    setPresets((prev) => [...prev, saved]);
    setPresetName("");
    setSavingPreset(false);
  }, [presetName, presets]);

  const handleLoadPreset = useCallback(async (id: string) => {
    const updated = await window.bridge.preset.load(id);
    setConfigs(updated.simulators ?? []);
    /* Main process stopped all simulators before applying the preset */
    setRunning(new Set(updated.runningIds));
    setSelectedSim(null);
    setShowPresets(false);
  }, []);

  const handleDeletePreset = useCallback(async (id: string) => {
    await window.bridge.preset.delete(id);
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const startRename = useCallback((preset: SimulatorPreset) => {
    setRenamingId(preset.id);
    setRenameValue(preset.name);
  }, []);

  const commitRename = useCallback(async () => {
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    const isDup = presets.some(
      (p) => p.id !== renamingId && p.name.trim().toLowerCase() === renameValue.trim().toLowerCase()
    );
    if (isDup) return;
    const updated = await window.bridge.preset.rename(renamingId, renameValue.trim());
    setPresets((prev) => prev.map((p) => (p.id === renamingId ? updated : p)));
    setRenamingId(null);
  }, [renamingId, renameValue, presets]);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue("");
  }, []);

  const [dragOverPresetId, setDragOverPresetId] = useState<string | null>(null);

  const handleDragStart = useCallback((id: string) => {
    draggedId.current = id;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    dragOverId.current = id;
    setDragOverPresetId(id);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const from = draggedId.current;
    const to = dragOverId.current;
    draggedId.current = null;
    dragOverId.current = null;
    setDragOverPresetId(null);
    if (!from || !to || from === to) return;

    setPresets((prev) => {
      const sorted = [...prev].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const fromIdx = sorted.findIndex((p) => p.id === from);
      const toIdx = sorted.findIndex((p) => p.id === to);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = [...sorted];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      const withOrder = next.map((p, i) => ({ ...p, order: i }));
      window.bridge.preset.reorder(withOrder.map((p) => p.id));
      return withOrder;
    });
  }, []);

  const selected = configs.find((c) => c.id === selectedSim);
  const selectedProfile = profiles.find((p) => p.id === selected?.profileId);

  return (
    <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>

      {/* ── Left: simulator list ──────────────────────────────── */}
      <div style={{
        width: 260, flexShrink: 0, borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column", background: "var(--surface)",
      }}>
        <div className="panel-header" style={{ justifyContent: "space-between" }}>
          <span>Simulators</span>
          <div className="flex items-center gap-4">
            <button
              className="btn btn-icon"
              title="Presets"
              style={{ fontSize: 11, padding: "1px 6px" }}
              onClick={() => { setShowPresets(!showPresets); setSavingPreset(false); setShowAddForm(false); }}
            >
              ⊞
            </button>
            <button
              className="btn btn-icon"
              style={{ fontSize: 14, padding: "1px 7px" }}
              onClick={() => { setShowAddForm(!showAddForm); setShowPresets(false); }}
            >
              +
            </button>
          </div>
        </div>

        {showAddForm && (
          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
            <p className="text-xs text-muted" style={{ marginBottom: 6 }}>Choose a device profile:</p>
            <div className="flex flex-col gap-4">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  className="btn btn-ghost"
                  style={{ justifyContent: "flex-start", textAlign: "left", padding: "4px 8px" }}
                  onClick={() => addSim(p.id)}
                >
                  <span className="text-xs">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {showPresets && (
          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
            <p className="section-label" style={{ marginBottom: 6 }}>Presets</p>

            {/* Saved presets list */}
            {presets.length === 0 && (
              <p className="text-xs text-muted" style={{ marginBottom: 8 }}>No presets saved yet.</p>
            )}
            {[...presets].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((preset) => (
              <div
                key={preset.id}
                className="flex items-center gap-4"
                draggable
                onDragStart={() => handleDragStart(preset.id)}
                onDragOver={(e) => handleDragOver(e, preset.id)}
                onDrop={handleDrop}
                onDragLeave={() => setDragOverPresetId(null)}
                style={{
                  marginBottom: 4,
                  borderRadius: 4,
                  outline: dragOverPresetId === preset.id ? "1px solid var(--teal)" : "none",
                }}
              >
                {/* Drag handle */}
                <span
                  style={{
                    cursor: "grab",
                    color: "var(--text-muted)",
                    fontSize: 10,
                    flexShrink: 0,
                    userSelect: "none",
                    paddingLeft: 2,
                  }}
                  title="Drag to reorder"
                >
                  ⠿
                </span>

                {renamingId === preset.id ? (
                  /* Inline rename input — fills the row */
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                    <input
                      type="text"
                      autoFocus
                      value={renameValue}
                      style={{
                        fontSize: 11,
                        outline: isDuplicateRenameName ? "1px solid var(--red, #e55)" : undefined,
                      }}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                        if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
                      }}
                    />
                    {isDuplicateRenameName && (
                      <span style={{ fontSize: 10, color: "var(--red, #e55)" }}>
                        Name already in use
                      </span>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Clicking the name enters rename mode */}
                    <button
                      className="btn btn-ghost flex-1"
                      style={{ justifyContent: "flex-start", textAlign: "left", padding: "4px 8px", overflow: "hidden" }}
                      title="Click to rename"
                      onClick={() => startRename(preset)}
                    >
                      <span className="text-xs truncate">{preset.name}</span>
                      <span className="text-xs text-muted" style={{ marginLeft: 4, flexShrink: 0 }}>
                        ×{preset.simulators.length}
                      </span>
                    </button>

                    {/* Explicit load button */}
                    <button
                      className="btn btn-icon"
                      style={{ padding: "2px 5px", fontSize: 10, flexShrink: 0 }}
                      title={`Load "${preset.name}"`}
                      onClick={(e) => { e.stopPropagation(); handleLoadPreset(preset.id); }}
                    >
                      ▶
                    </button>
                  </>
                )}

                {/* Delete button */}
                <button
                  className="btn btn-icon"
                  style={{ padding: "2px 5px", fontSize: 10, flexShrink: 0 }}
                  title="Delete preset"
                  onClick={() => handleDeletePreset(preset.id)}
                >
                  ✕
                </button>
              </div>
            ))}

            {/* Save current config as preset */}
            <div style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              {!savingPreset ? (
                <button
                  className="btn btn-ghost"
                  style={{ width: "100%", justifyContent: "flex-start", padding: "4px 8px" }}
                  disabled={configs.length === 0}
                  title={configs.length === 0 ? "Add simulators first" : "Save current rig as a named preset"}
                  onClick={() => { setSavingPreset(true); setPresetName(""); }}
                >
                  <span className="text-xs">+ Save as preset…</span>
                </button>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Preset name…"
                      value={presetName}
                      style={{
                        flex: 1,
                        fontSize: 11,
                        outline: isDuplicateSaveName ? "1px solid var(--red, #e55)" : undefined,
                      }}
                      onChange={(e) => setPresetName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSavePreset();
                        if (e.key === "Escape") { setSavingPreset(false); setPresetName(""); }
                      }}
                    />
                    <button
                      className="btn btn-primary"
                      style={{ padding: "2px 8px", fontSize: 11 }}
                      disabled={!presetName.trim() || isDuplicateSaveName}
                      onClick={handleSavePreset}
                    >
                      Save
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "2px 6px", fontSize: 11 }}
                      onClick={() => { setSavingPreset(false); setPresetName(""); }}
                    >
                      ✕
                    </button>
                  </div>
                  {isDuplicateSaveName && (
                    <span style={{ fontSize: 10, color: "var(--red, #e55)" }}>
                      A preset with this name already exists
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="scroll-y flex-1">
          {configs.length === 0 && (
            <div style={{ padding: 16 }}>
              <p className="text-xs text-muted" style={{ lineHeight: 1.6 }}>
                No simulators yet. Click <strong>+</strong> to add a device.
              </p>
            </div>
          )}
          {configs.map((cfg) => {
            const isRunning = running.has(cfg.id);
            const hasError  = !!errors[cfg.id];
            const color = hasError ? "red" : isRunning ? "green" : "gray";
            return (
              <div
                key={cfg.id}
                onClick={() => setSelectedSim(cfg.id)}
                style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  borderBottom: "1px solid var(--border)",
                  background: selectedSim === cfg.id ? "var(--surface2)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <StatusLight color={color} />
                <div className="flex-1 overflow-hidden">
                  <div className="text-sm truncate" style={{ color: "var(--text)" }}>{cfg.name}</div>
                  <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                    :{cfg.port} · {cfg.profileId}
                  </div>
                </div>
                <button
                  className="btn btn-icon"
                  style={{ padding: "2px 6px", fontSize: 10 }}
                  onClick={(e) => { e.stopPropagation(); toggleStart(cfg); }}
                >
                  {isRunning ? "■" : "▶"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Safety note */}
        <div style={{ padding: "8px 10px", borderTop: "1px solid var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
            🔒 All simulators bind to <strong style={{ color: "var(--teal)" }}>127.0.0.1</strong> only — never exposed externally.
          </p>
        </div>
      </div>

      {/* ── Right: detail / log ───────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {!selected && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 28 }}>🎛</span>
            <span className="text-muted text-sm">Select a simulator to configure</span>
          </div>
        )}

        {selected && selectedProfile && (
          <>
            {/* Config panel */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
              <div className="flex items-center gap-8" style={{ marginBottom: 10 }}>
                <div className="flex-1">
                  <input
                    type="text"
                    value={selected.name}
                    style={{ fontSize: 13, fontWeight: 600, background: "transparent", border: "none", padding: 0, width: "100%" }}
                    onChange={(e) => updateConfig(selected.id, { name: e.target.value })}
                  />
                  <div className="text-xs text-muted">{selectedProfile.description}</div>
                </div>
                <button
                  className={`btn ${running.has(selected.id) ? "btn-danger" : "btn-primary"}`}
                  onClick={() => toggleStart(selected)}
                >
                  {running.has(selected.id) ? "■ Stop" : "▶ Start"}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => duplicateSim(selected)}
                  title="Duplicate simulator"
                >
                  ⧉
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => removeSim(selected.id)}
                  title="Remove simulator"
                >
                  ✕
                </button>
              </div>

              {errors[selected.id] && (
                <div className="text-red text-xs" style={{ marginBottom: 8 }}>
                  ⚠ {errors[selected.id]}
                </div>
              )}

              <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
                <LabeledInput label="Port" type="number" value={String(selected.port)} width={80}
                  onChange={(v) => updateConfig(selected.id, { port: Number(v) })}
                  note="localhost only" />
                <LabeledInput label="Latency (ms)" type="number" value={String(selected.latencyMs)} width={70}
                  onChange={(v) => updateConfig(selected.id, { latencyMs: Number(v) })} />
                <LabeledInput label="Error rate (%)" type="number" value={String(selected.errorRate)} width={70}
                  onChange={(v) => updateConfig(selected.id, { errorRate: Number(v) })} />
                <div className="flex items-center gap-6">
                  <label className="text-xs text-muted">Discoverable</label>
                  <input
                    type="checkbox"
                    checked={selected.discoverable}
                    onChange={(e) => updateConfig(selected.id, { discoverable: e.target.checked })}
                  />
                </div>
              </div>
            </div>

            {/* Three-level inventory */}
            <div style={{
              padding: "8px 14px",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface2)",
              flexShrink: 0,
            }}>
              <div className="flex gap-8" style={{ flexWrap: "wrap", rowGap: 6 }}>
                <div>
                  <span className="section-label">Systems</span>
                  <div className="flex gap-4" style={{ marginTop: 4, flexWrap: "wrap" }}>
                    {selectedProfile.systems.map((s, i) => (
                      <span key={i} className="badge badge-teal">{s}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="section-label">Capabilities</span>
                  <div className="flex gap-4" style={{ marginTop: 4, flexWrap: "wrap" }}>
                    {selectedProfile.capabilities.map((c, i) => (
                      <span key={i} className="badge badge-gray">{c}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* OSC address inventory */}
            <div style={{
              maxHeight: 140,
              overflowY: "auto",
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
            }}>
              <div style={{ padding: "6px 14px" }}>
                <span className="section-label">OSC address inventory</span>
              </div>
              {selectedProfile.inventory.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "3px 14px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span className="font-mono text-xs" style={{ color: "var(--teal)", minWidth: 220 }}>{item.address}</span>
                  <span className="text-xs text-muted truncate">{item.label}</span>
                  {item.meta && (
                    <span className="badge badge-gray" style={{ marginLeft: "auto", flexShrink: 0 }}>{item.meta}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Live event log */}
            <div className="panel-header" style={{ flexShrink: 0, borderTop: "none" }}>
              <span>Live OSC events</span>
              <button
                className="btn btn-icon"
                style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 10 }}
                onClick={() => setEventMap((prev) => ({ ...prev, [selected.id]: [] }))}
              >
                Clear
              </button>
            </div>
            <LogPane
              lines={eventMap[selected.id] ?? []}
              style={{ flex: 1 }}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ── helpers ──────────────────────────────────────────────────────── */

interface LabeledInputProps {
  label: string;
  type: string;
  value: string;
  width: number;
  onChange: (v: string) => void;
  note?: string;
}

function LabeledInput({ label, type, value, width, onChange, note }: LabeledInputProps): React.ReactElement {
  return (
    <div className="flex items-center gap-4">
      <label className="text-xs text-muted">{label}</label>
      <input
        type={type}
        value={value}
        style={{ width }}
        onChange={(e) => onChange(e.target.value)}
      />
      {note && <span className="text-xs" style={{ color: "var(--teal)" }}>{note}</span>}
    </div>
  );
}

function formatOscEvent(ev: OscEvent): string {
  const dir = ev.direction === "in" ? "←" : "→";
  const dropped = ev.dropped ? " [DROPPED]" : "";
  const addr = ev.address.padEnd(36);
  const reply = ev.replyData ? ` ⮐ ${ev.replyData.slice(0, 60)}` : "";
  return `${dir} ${addr} ${ev.latencyMs}ms${dropped}${reply}`;
}
