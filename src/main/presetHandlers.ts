import type { AppSettings, SimulatorPreset } from "./store.js";

export type SavePresetResult = { settings: AppSettings; preset: SimulatorPreset };
export type LoadPresetResult = AppSettings & { runningIds: string[] };

export function handlePresetSave(
  settings: AppSettings,
  name: string,
  saveFn: (s: AppSettings) => void,
): SavePresetResult {
  const existing = settings.presets ?? [];
  const maxOrder = existing.reduce((m, p) => Math.max(m, p.order ?? 0), -1);
  const preset: SimulatorPreset = {
    id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || "Untitled preset",
    simulators: settings.simulators.map((s) => ({ ...s })),
    createdAt: Date.now(),
    order: maxOrder + 1,
  };
  const next: AppSettings = { ...settings, presets: [...existing, preset] };
  saveFn(next);
  return { settings: next, preset };
}

export function handlePresetLoad(
  settings: AppSettings,
  id: string,
  saveFn: (s: AppSettings) => void,
  stopAll: () => void,
): LoadPresetResult {
  const preset = (settings.presets ?? []).find((p) => p.id === id);
  if (!preset) throw new Error(`Preset ${id} not found`);
  stopAll();
  const fresh = preset.simulators.map((s) => ({ ...s, enabled: false }));
  const next: AppSettings = { ...settings, simulators: fresh };
  saveFn(next);
  return { ...next, runningIds: [] };
}

export function handlePresetDelete(
  settings: AppSettings,
  id: string,
  saveFn: (s: AppSettings) => void,
): AppSettings {
  const next: AppSettings = {
    ...settings,
    presets: (settings.presets ?? []).filter((p) => p.id !== id),
  };
  saveFn(next);
  return next;
}

export function handlePresetRename(
  settings: AppSettings,
  id: string,
  newName: string,
  saveFn: (s: AppSettings) => void,
): SimulatorPreset {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Preset name cannot be empty");
  const exists = (settings.presets ?? []).some((p) => p.id === id);
  if (!exists) throw new Error(`Preset ${id} not found`);
  const next: AppSettings = {
    ...settings,
    presets: (settings.presets ?? []).map((p) =>
      p.id === id ? { ...p, name: trimmed } : p
    ),
  };
  saveFn(next);
  const updated = (next.presets ?? []).find((p) => p.id === id);
  if (!updated) throw new Error(`Preset ${id} not found after rename`);
  return updated;
}

export function handlePresetReorder(
  settings: AppSettings,
  orderedIds: string[],
  saveFn: (s: AppSettings) => void,
): SimulatorPreset[] {
  const map = new Map((settings.presets ?? []).map((p) => [p.id, p]));
  const reordered = orderedIds
    .filter((id) => map.has(id))
    .map((id, i) => ({ ...map.get(id)!, order: i }));
  const rest = (settings.presets ?? [])
    .filter((p) => !orderedIds.includes(p.id))
    .map((p, i) => ({ ...p, order: reordered.length + i }));
  const next: AppSettings = { ...settings, presets: [...reordered, ...rest] };
  saveFn(next);
  return next.presets ?? [];
}
