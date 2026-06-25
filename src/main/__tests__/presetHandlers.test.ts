import { describe, it, expect, vi, beforeEach } from "vitest";
import { handlePresetSave, handlePresetLoad, handlePresetDelete, handlePresetRename, handlePresetReorder } from "../presetHandlers.js";
import type { AppSettings } from "../store.js";

const BASE_SETTINGS: AppSettings = {
  runLocalPath: "",
  ngrokPath: "",
  ngrokPort: 8001,
  simulators: [
    {
      id: "sim-1",
      name: "Test Sim",
      profileId: "eos-eos",
      port: 7000,
      latencyMs: 5,
      errorRate: 0,
      enabled: true,
      discoverable: true,
    },
  ],
  presets: [],
};

describe("handlePresetSave", () => {
  let saveFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    saveFn = vi.fn();
  });

  it("saves the current simulators as a new preset and calls saveFn", () => {
    const { settings, preset } = handlePresetSave(BASE_SETTINGS, "My Preset", saveFn);

    expect(preset.name).toBe("My Preset");
    expect(preset.simulators).toHaveLength(1);
    expect(preset.simulators[0]!.id).toBe("sim-1");
    expect(preset.order).toBe(0);
    expect(settings.presets).toHaveLength(1);
    expect(settings.presets[0]).toEqual(preset);
    expect(saveFn).toHaveBeenCalledOnce();
    expect(saveFn).toHaveBeenCalledWith(settings);
  });

  it("trims whitespace from the preset name", () => {
    const { preset } = handlePresetSave(BASE_SETTINGS, "  Trimmed  ", saveFn);
    expect(preset.name).toBe("Trimmed");
  });

  it("falls back to 'Untitled preset' when name is blank", () => {
    const { preset } = handlePresetSave(BASE_SETTINGS, "   ", saveFn);
    expect(preset.name).toBe("Untitled preset");
  });

  it("assigns incrementing order values across multiple saves", () => {
    const first = handlePresetSave(BASE_SETTINGS, "First", saveFn);
    const second = handlePresetSave(first.settings, "Second", saveFn);
    expect(first.preset.order).toBe(0);
    expect(second.preset.order).toBe(1);
  });

  it("snapshots the simulators at save time — later changes do not affect the preset", () => {
    const { preset, settings } = handlePresetSave(BASE_SETTINGS, "Snapshot", saveFn);
    const simInPreset = preset.simulators[0]!;
    const simInSettings = settings.simulators[0]!;
    simInSettings.name = "Changed";
    expect(simInPreset.name).toBe("Test Sim");
  });

  it("generates a unique id for each preset", () => {
    const first = handlePresetSave(BASE_SETTINGS, "A", saveFn);
    const second = handlePresetSave(BASE_SETTINGS, "B", saveFn);
    expect(first.preset.id).not.toBe(second.preset.id);
  });
});

describe("handlePresetLoad", () => {
  let saveFn: ReturnType<typeof vi.fn>;
  let stopAll: ReturnType<typeof vi.fn>;
  let settingsWithPreset: AppSettings;

  beforeEach(() => {
    saveFn = vi.fn();
    stopAll = vi.fn();
    settingsWithPreset = {
      ...BASE_SETTINGS,
      presets: [
        {
          id: "preset-abc",
          name: "Saved",
          simulators: [
            {
              id: "sim-saved",
              name: "Saved Sim",
              profileId: "eos-eos",
              port: 8000,
              latencyMs: 10,
              errorRate: 0,
              enabled: true,
              discoverable: true,
            },
          ],
          createdAt: 1000,
          order: 0,
        },
      ],
    };
  });

  it("replaces simulators with the preset's simulators", () => {
    const result = handlePresetLoad(settingsWithPreset, "preset-abc", saveFn, stopAll);
    expect(result.simulators).toHaveLength(1);
    expect(result.simulators[0]!.id).toBe("sim-saved");
  });

  it("sets all loaded simulators to enabled:false", () => {
    const result = handlePresetLoad(settingsWithPreset, "preset-abc", saveFn, stopAll);
    expect(result.simulators.every((s) => s.enabled === false)).toBe(true);
  });

  it("returns runningIds as an empty array", () => {
    const result = handlePresetLoad(settingsWithPreset, "preset-abc", saveFn, stopAll);
    expect(result.runningIds).toEqual([]);
  });

  it("calls stopAll before applying the preset", () => {
    const callOrder: string[] = [];
    const orderedStop = vi.fn(() => callOrder.push("stop"));
    const orderedSave = vi.fn(() => callOrder.push("save"));
    handlePresetLoad(settingsWithPreset, "preset-abc", orderedSave, orderedStop);
    expect(callOrder[0]).toBe("stop");
    expect(callOrder[1]).toBe("save");
  });

  it("calls saveFn with the updated settings", () => {
    handlePresetLoad(settingsWithPreset, "preset-abc", saveFn, stopAll);
    expect(saveFn).toHaveBeenCalledOnce();
    const saved = saveFn.mock.calls[0]![0] as AppSettings;
    expect(saved.simulators[0]!.id).toBe("sim-saved");
  });

  it("throws when the preset id is not found", () => {
    expect(() =>
      handlePresetLoad(settingsWithPreset, "nonexistent", saveFn, stopAll),
    ).toThrow("Preset nonexistent not found");
  });
});

describe("handlePresetRename", () => {
  let saveFn: ReturnType<typeof vi.fn>;
  let settingsWithPresets: ReturnType<typeof makeSettingsWithPresets>;

  function makeSettingsWithPresets() {
    return {
      ...BASE_SETTINGS,
      presets: [
        { id: "p-1", name: "Alpha", simulators: [], createdAt: 1000, order: 0 },
        { id: "p-2", name: "Beta",  simulators: [], createdAt: 2000, order: 1 },
      ],
    };
  }

  beforeEach(() => {
    saveFn = vi.fn();
    settingsWithPresets = makeSettingsWithPresets();
  });

  it("renames the preset and returns the updated preset", () => {
    const updated = handlePresetRename(settingsWithPresets, "p-1", "Alpha Renamed", saveFn);
    expect(updated.id).toBe("p-1");
    expect(updated.name).toBe("Alpha Renamed");
  });

  it("trims whitespace from the new name", () => {
    const updated = handlePresetRename(settingsWithPresets, "p-1", "  Trimmed  ", saveFn);
    expect(updated.name).toBe("Trimmed");
  });

  it("persists the rename by calling saveFn", () => {
    handlePresetRename(settingsWithPresets, "p-1", "New Name", saveFn);
    expect(saveFn).toHaveBeenCalledOnce();
    const saved = saveFn.mock.calls[0]![0];
    expect(saved.presets.find((p: { id: string }) => p.id === "p-1").name).toBe("New Name");
  });

  it("does not affect other presets", () => {
    handlePresetRename(settingsWithPresets, "p-1", "New Name", saveFn);
    const saved = saveFn.mock.calls[0]![0];
    expect(saved.presets.find((p: { id: string }) => p.id === "p-2").name).toBe("Beta");
  });

  it("throws when the new name is blank", () => {
    expect(() =>
      handlePresetRename(settingsWithPresets, "p-1", "   ", saveFn),
    ).toThrow("Preset name cannot be empty");
    expect(saveFn).not.toHaveBeenCalled();
  });

  it("throws when the preset id is not found", () => {
    expect(() =>
      handlePresetRename(settingsWithPresets, "nonexistent", "New", saveFn),
    ).toThrow("Preset nonexistent not found");
    expect(saveFn).not.toHaveBeenCalled();
  });
});

describe("handlePresetReorder", () => {
  let saveFn: ReturnType<typeof vi.fn>;
  let settingsWithPresets: ReturnType<typeof makeSettingsWithThree>;

  function makeSettingsWithThree() {
    return {
      ...BASE_SETTINGS,
      presets: [
        { id: "p-1", name: "First",  simulators: [], createdAt: 1000, order: 0 },
        { id: "p-2", name: "Second", simulators: [], createdAt: 2000, order: 1 },
        { id: "p-3", name: "Third",  simulators: [], createdAt: 3000, order: 2 },
      ],
    };
  }

  beforeEach(() => {
    saveFn = vi.fn();
    settingsWithPresets = makeSettingsWithThree();
  });

  it("reassigns order according to the provided id array", () => {
    const result = handlePresetReorder(settingsWithPresets, ["p-3", "p-1", "p-2"], saveFn);
    const byId = Object.fromEntries(result.map((p) => [p.id, p.order]));
    expect(byId["p-3"]).toBe(0);
    expect(byId["p-1"]).toBe(1);
    expect(byId["p-2"]).toBe(2);
  });

  it("calls saveFn with the reordered settings", () => {
    handlePresetReorder(settingsWithPresets, ["p-2", "p-3", "p-1"], saveFn);
    expect(saveFn).toHaveBeenCalledOnce();
    const saved = saveFn.mock.calls[0]![0];
    expect(saved.presets.find((p: { id: string }) => p.id === "p-2").order).toBe(0);
  });

  it("returns the full presets array", () => {
    const result = handlePresetReorder(settingsWithPresets, ["p-1", "p-2", "p-3"], saveFn);
    expect(result).toHaveLength(3);
  });

  it("silently ignores ids that don't match any preset", () => {
    const result = handlePresetReorder(settingsWithPresets, ["p-1", "unknown-id", "p-2", "p-3"], saveFn);
    expect(result).toHaveLength(3);
    expect(result.every((p) => p.id !== "unknown-id")).toBe(true);
  });

  it("appends unmapped presets at the end with higher order values", () => {
    const result = handlePresetReorder(settingsWithPresets, ["p-1", "p-2"], saveFn);
    const p3 = result.find((p) => p.id === "p-3")!;
    expect(p3.order).toBeGreaterThanOrEqual(2);
  });
});

describe("handlePresetDelete", () => {
  let saveFn: ReturnType<typeof vi.fn>;
  let settingsWithPresets: AppSettings;

  beforeEach(() => {
    saveFn = vi.fn();
    settingsWithPresets = {
      ...BASE_SETTINGS,
      presets: [
        { id: "p-1", name: "First", simulators: [], createdAt: 1000, order: 0 },
        { id: "p-2", name: "Second", simulators: [], createdAt: 2000, order: 1 },
      ],
    };
  });

  it("removes the specified preset from the list", () => {
    const next = handlePresetDelete(settingsWithPresets, "p-1", saveFn);
    expect(next.presets).toHaveLength(1);
    expect(next.presets[0]!.id).toBe("p-2");
  });

  it("calls saveFn with the updated settings", () => {
    handlePresetDelete(settingsWithPresets, "p-1", saveFn);
    expect(saveFn).toHaveBeenCalledOnce();
    expect(saveFn.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ presets: [expect.objectContaining({ id: "p-2" })] }),
    );
  });

  it("leaves settings unchanged when the id does not match any preset", () => {
    const next = handlePresetDelete(settingsWithPresets, "nonexistent", saveFn);
    expect(next.presets).toHaveLength(2);
    expect(saveFn).toHaveBeenCalledOnce();
  });

  it("handles an empty presets array without throwing", () => {
    const empty = { ...BASE_SETTINGS, presets: [] };
    const next = handlePresetDelete(empty, "p-1", saveFn);
    expect(next.presets).toHaveLength(0);
  });
});
