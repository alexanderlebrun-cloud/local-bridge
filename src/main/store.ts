import { app } from "electron";
import fs from "fs";
import path from "path";

export interface SimulatorConfig {
  id: string;
  name: string;
  profileId: string;
  port: number;
  latencyMs: number;
  errorRate: number;
  enabled: boolean;
  discoverable: boolean;
}

export interface SimulatorPreset {
  id: string;
  name: string;
  simulators: SimulatorConfig[];
  createdAt: number;
  order: number;
}

export interface AppSettings {
  runLocalPath: string;
  ngrokPath: string;
  ngrokPort: number;
  simulators: SimulatorConfig[];
  presets: SimulatorPreset[];
}

const DEFAULT_SETTINGS: AppSettings = {
  runLocalPath: "",
  ngrokPath: "",
  ngrokPort: 8001,
  simulators: [],
  presets: [],
};

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

export function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), "utf8");
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: AppSettings): void {
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2), "utf8");
}
