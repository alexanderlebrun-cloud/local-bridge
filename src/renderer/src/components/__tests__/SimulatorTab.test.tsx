import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SimulatorTab from "../SimulatorTab";
import type { SimulatorPreset, SimulatorConfig, AppSettings } from "../../bridge";

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function makePreset(overrides: Partial<SimulatorPreset> = {}): SimulatorPreset {
  return {
    id: "preset-1",
    name: "My Preset",
    simulators: [],
    createdAt: 1000,
    order: 0,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<SimulatorConfig> = {}): SimulatorConfig {
  return {
    id: "sim-1",
    name: "EOS Console",
    profileId: "eos-eos",
    port: 7000,
    latencyMs: 5,
    errorRate: 0,
    enabled: false,
    discoverable: true,
    ...overrides,
  };
}

const defaultSettings: AppSettings = {
  runLocalPath: "",
  ngrokPath: "",
  ngrokPort: 8001,
  simulators: [makeConfig()],
  presets: [],
};

/* ── window.bridge mock factory ───────────────────────────────────────────── */

function makeBridge(overrides: {
  presets?: SimulatorPreset[];
  configs?: SimulatorConfig[];
  saveResult?: SimulatorPreset;
  loadResult?: AppSettings & { runningIds: string[] };
} = {}) {
  const presets = overrides.presets ?? [];
  const configs = overrides.configs ?? [makeConfig()];

  return {
    process: {
      start: vi.fn().mockResolvedValue({ ok: true }),
      stop: vi.fn().mockResolvedValue({ ok: true }),
      restart: vi.fn().mockResolvedValue({ ok: true }),
      stopAll: vi.fn().mockResolvedValue({ ok: true }),
      getStatuses: vi.fn().mockResolvedValue([]),
      onStatus: vi.fn().mockReturnValue(() => {}),
      onLog: vi.fn().mockReturnValue(() => {}),
      onNgrokUrl: vi.fn().mockReturnValue(() => {}),
    },
    sim: {
      start: vi.fn().mockResolvedValue({ ok: true }),
      stop: vi.fn().mockResolvedValue({ ok: true }),
      list: vi.fn().mockResolvedValue([]),
      events: vi.fn().mockResolvedValue([]),
      profiles: vi.fn().mockResolvedValue([]),
      onEvent: vi.fn().mockReturnValue(() => {}),
      onError: vi.fn().mockReturnValue(() => {}),
    },
    settings: {
      get: vi.fn().mockResolvedValue({ ...defaultSettings, simulators: configs }),
      set: vi.fn().mockResolvedValue({ ...defaultSettings, simulators: configs }),
      onUpdated: vi.fn().mockReturnValue(() => {}),
    },
    preset: {
      list: vi.fn().mockResolvedValue(presets),
      save: vi.fn().mockResolvedValue(
        overrides.saveResult ??
          makePreset({
            id: "preset-new",
            name: "Saved Preset",
            simulators: configs,
          }),
      ),
      load: vi.fn().mockResolvedValue(
        overrides.loadResult ?? {
          ...defaultSettings,
          simulators: [makeConfig({ id: "sim-loaded", name: "Loaded Sim" })],
          runningIds: [],
        },
      ),
      delete: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn(),
      reorder: vi.fn().mockResolvedValue([]),
    },
    updater: {
      onStatus: vi.fn().mockReturnValue(() => {}),
      install: vi.fn().mockResolvedValue(undefined),
    },
    dialog: {
      openFile: vi.fn().mockResolvedValue(null),
    },
  };
}

/* ── Test suite ───────────────────────────────────────────────────────────── */

describe("SimulatorTab — preset panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* helper: render and wait for initial data to load */
  async function setup(bridgeOverrides: Parameters<typeof makeBridge>[0] = {}) {
    const bridge = makeBridge(bridgeOverrides);
    Object.defineProperty(window, "bridge", { value: bridge, configurable: true, writable: true });
    const user = userEvent.setup();

    let result!: ReturnType<typeof render>;
    await act(async () => {
      result = render(<SimulatorTab />);
    });

    /* open the preset panel */
    const presetsButton = screen.getByTitle("Presets");
    await user.click(presetsButton);

    return { bridge, user, ...result };
  }

  /* ── Save ──────────────────────────────────────────────────────────── */

  describe("saving a preset", () => {
    it("shows the save form when '+ Save as preset…' is clicked", async () => {
      await setup();

      const saveBtn = screen.getByText("+ Save as preset…");
      fireEvent.click(saveBtn);

      expect(screen.getByPlaceholderText("Preset name…")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    it("calls bridge.preset.save with the typed name on Save click", async () => {
      const { bridge, user } = await setup();

      fireEvent.click(screen.getByText("+ Save as preset…"));
      const input = screen.getByPlaceholderText("Preset name…");
      await user.type(input, "My Test Preset");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(bridge.preset.save).toHaveBeenCalledOnce();
      expect(bridge.preset.save).toHaveBeenCalledWith("My Test Preset");
    });

    it("calls bridge.preset.save when Enter is pressed in the name field", async () => {
      const { bridge, user } = await setup();

      fireEvent.click(screen.getByText("+ Save as preset…"));
      const input = screen.getByPlaceholderText("Preset name…");
      await user.type(input, "Keyboard Preset");
      await user.keyboard("{Enter}");

      expect(bridge.preset.save).toHaveBeenCalledOnce();
      expect(bridge.preset.save).toHaveBeenCalledWith("Keyboard Preset");
    });

    it("adds the returned preset to the list after saving", async () => {
      await setup({
        saveResult: makePreset({ id: "preset-new", name: "My Test Preset" }),
      });

      fireEvent.click(screen.getByText("+ Save as preset…"));
      const input = screen.getByPlaceholderText("Preset name…");
      fireEvent.change(input, { target: { value: "My Test Preset" } });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
      });

      await waitFor(() => {
        expect(screen.getByText("My Test Preset")).toBeInTheDocument();
      });
    });

    it("hides the name input after a successful save", async () => {
      const { user } = await setup({
        saveResult: makePreset({ id: "preset-new", name: "Saved" }),
      });

      fireEvent.click(screen.getByText("+ Save as preset…"));
      const input = screen.getByPlaceholderText("Preset name…");
      await user.type(input, "Saved");
      await act(async () => {
        await user.click(screen.getByRole("button", { name: "Save" }));
      });

      await waitFor(() => {
        expect(screen.queryByPlaceholderText("Preset name…")).not.toBeInTheDocument();
      });
    });

    it("does not call save when name is blank", async () => {
      const { bridge } = await setup();

      fireEvent.click(screen.getByText("+ Save as preset…"));
      const saveBtn = screen.getByRole("button", { name: "Save" });
      expect(saveBtn).toBeDisabled();
      fireEvent.click(saveBtn);

      expect(bridge.preset.save).not.toHaveBeenCalled();
    });

    it("dismisses the form when ✕ is clicked", async () => {
      const { user } = await setup();

      fireEvent.click(screen.getByText("+ Save as preset…"));
      expect(screen.getByPlaceholderText("Preset name…")).toBeInTheDocument();

      /* The only ✕ button visible when no presets exist is the cancel button */
      const cancelBtn = screen.getByRole("button", { name: "✕" });
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByPlaceholderText("Preset name…")).not.toBeInTheDocument();
      });
    });
  });

  /* ── Load ──────────────────────────────────────────────────────────── */

  describe("loading a preset", () => {
    it("shows a load button (▶) for each preset", async () => {
      await setup({ presets: [makePreset({ id: "p-1", name: "Show A" })] });

      const loadBtn = screen.getByTitle('Load "Show A"');
      expect(loadBtn).toBeInTheDocument();
    });

    it("calls bridge.preset.load with the preset id when ▶ is clicked", async () => {
      const { bridge, user } = await setup({
        presets: [makePreset({ id: "p-1", name: "Show A" })],
      });

      await user.click(screen.getByTitle('Load "Show A"'));

      expect(bridge.preset.load).toHaveBeenCalledOnce();
      expect(bridge.preset.load).toHaveBeenCalledWith("p-1");
    });

    it("replaces the simulator configs after loading", async () => {
      const { user } = await setup({
        presets: [makePreset({ id: "p-1", name: "Show A" })],
        loadResult: {
          ...defaultSettings,
          simulators: [makeConfig({ id: "sim-loaded", name: "Loaded Sim", port: 9000 })],
          runningIds: [],
        },
      });

      await user.click(screen.getByTitle('Load "Show A"'));

      await waitFor(() => {
        expect(screen.getByText("Loaded Sim")).toBeInTheDocument();
      });
    });

    it("clears the running set after loading (all sims appear stopped)", async () => {
      const { user } = await setup({
        presets: [makePreset({ id: "p-1", name: "Show A" })],
        loadResult: {
          ...defaultSettings,
          simulators: [makeConfig({ id: "sim-x", name: "Loaded" })],
          runningIds: [],
        },
      });

      await user.click(screen.getByTitle('Load "Show A"'));

      await waitFor(() => {
        /* The start/stop button should show ▶ (not running) for every sim */
        const startStopButtons = screen.getAllByRole("button").filter(
          (btn) => btn.textContent === "▶",
        );
        expect(startStopButtons.length).toBeGreaterThan(0);
      });
    });

    it("closes the preset panel after loading", async () => {
      const { user } = await setup({
        presets: [makePreset({ id: "p-1", name: "Show A" })],
      });

      await user.click(screen.getByTitle('Load "Show A"'));

      await waitFor(() => {
        expect(screen.queryByText("Presets")).not.toBeInTheDocument();
      });
    });
  });

  /* ── Rename ────────────────────────────────────────────────────────── */

  describe("renaming a preset", () => {
    it("shows a text input when the preset name is clicked", async () => {
      const { user } = await setup({
        presets: [makePreset({ id: "p-1", name: "Show A" })],
      });

      await user.click(screen.getByTitle("Click to rename"));

      expect(screen.getByDisplayValue("Show A")).toBeInTheDocument();
    });

    it("calls bridge.preset.rename with the new name on Enter", async () => {
      const { bridge, user } = await setup({
        presets: [makePreset({ id: "p-1", name: "Show A" })],
      });
      bridge.preset.rename = vi.fn().mockResolvedValue(
        makePreset({ id: "p-1", name: "Show A Renamed" })
      );
      Object.defineProperty(window, "bridge", { value: bridge, configurable: true, writable: true });

      await user.click(screen.getByTitle("Click to rename"));
      const input = screen.getByDisplayValue("Show A");
      await user.clear(input);
      await user.type(input, "Show A Renamed");
      await user.keyboard("{Enter}");

      expect(bridge.preset.rename).toHaveBeenCalledWith("p-1", "Show A Renamed");
    });

    it("updates the displayed name after a successful rename", async () => {
      const { bridge, user } = await setup({
        presets: [makePreset({ id: "p-1", name: "Show A" })],
      });
      bridge.preset.rename = vi.fn().mockResolvedValue(
        makePreset({ id: "p-1", name: "Show A Renamed" })
      );
      Object.defineProperty(window, "bridge", { value: bridge, configurable: true, writable: true });

      await user.click(screen.getByTitle("Click to rename"));
      const input = screen.getByDisplayValue("Show A");
      await user.clear(input);
      await user.type(input, "Show A Renamed");
      await act(async () => { await user.keyboard("{Enter}"); });

      await waitFor(() => {
        expect(screen.getByText("Show A Renamed")).toBeInTheDocument();
      });
    });

    it("hides the input after committing a rename", async () => {
      const { bridge, user } = await setup({
        presets: [makePreset({ id: "p-1", name: "Show A" })],
      });
      bridge.preset.rename = vi.fn().mockResolvedValue(
        makePreset({ id: "p-1", name: "Show A Renamed" })
      );
      Object.defineProperty(window, "bridge", { value: bridge, configurable: true, writable: true });

      await user.click(screen.getByTitle("Click to rename"));
      const input = screen.getByDisplayValue("Show A");
      await user.clear(input);
      await user.type(input, "Show A Renamed");
      await act(async () => { await user.keyboard("{Enter}"); });

      await waitFor(() => {
        expect(screen.queryByDisplayValue("Show A Renamed")).not.toBeInTheDocument();
      });
    });

    it("cancels the rename on Escape — input disappears, name unchanged", async () => {
      const { bridge, user } = await setup({
        presets: [makePreset({ id: "p-1", name: "Show A" })],
      });

      await user.click(screen.getByTitle("Click to rename"));
      expect(screen.getByDisplayValue("Show A")).toBeInTheDocument();

      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByDisplayValue("Show A")).not.toBeInTheDocument();
      });
      expect(bridge.preset.rename).not.toHaveBeenCalled();
      expect(screen.getByText("Show A")).toBeInTheDocument();
    });
  });

  /* ── Delete ────────────────────────────────────────────────────────── */

  describe("deleting a preset", () => {
    it("shows a delete button (✕) for each preset", async () => {
      await setup({ presets: [makePreset({ id: "p-1", name: "Show A" })] });

      const deleteBtn = screen.getByTitle("Delete preset");
      expect(deleteBtn).toBeInTheDocument();
    });

    it("calls bridge.preset.delete with the preset id when ✕ is clicked", async () => {
      const { bridge, user } = await setup({
        presets: [makePreset({ id: "p-1", name: "Show A" })],
      });

      await user.click(screen.getByTitle("Delete preset"));

      expect(bridge.preset.delete).toHaveBeenCalledOnce();
      expect(bridge.preset.delete).toHaveBeenCalledWith("p-1");
    });

    it("removes the preset from the list after deletion", async () => {
      const { user } = await setup({
        presets: [makePreset({ id: "p-1", name: "Show A" })],
      });

      expect(screen.getByText("Show A")).toBeInTheDocument();

      await act(async () => {
        await user.click(screen.getByTitle("Delete preset"));
      });

      await waitFor(() => {
        expect(screen.queryByText("Show A")).not.toBeInTheDocument();
      });
    });

    it("shows 'No presets saved yet.' after all presets are deleted", async () => {
      const { user } = await setup({
        presets: [makePreset({ id: "p-1", name: "Only One" })],
      });

      await act(async () => {
        await user.click(screen.getByTitle("Delete preset"));
      });

      await waitFor(() => {
        expect(screen.getByText("No presets saved yet.")).toBeInTheDocument();
      });
    });

    it("handles multiple presets — only the clicked one is removed", async () => {
      const { user } = await setup({
        presets: [
          makePreset({ id: "p-1", name: "Alpha", order: 0 }),
          makePreset({ id: "p-2", name: "Beta", order: 1 }),
        ],
      });

      const deleteBtns = screen.getAllByTitle("Delete preset");
      await act(async () => {
        await user.click(deleteBtns[0]!);
      });

      await waitFor(() => {
        expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
        expect(screen.getByText("Beta")).toBeInTheDocument();
      });
    });
  });
});
