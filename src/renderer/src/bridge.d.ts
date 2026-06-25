/* Shared window.bridge type — mirrors src/preload/index.ts */

export interface ProcessStatus {
  id: "runLocal" | "ngrok";
  running: boolean;
  pid?: number;
  ngrokUrl?: string;
  error?: string;
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

export interface SimulatorProfile {
  id: string;
  name: string;
  description: string;
  defaultPort: number;
  icon: string;
  systems: string[];
  capabilities: string[];
  inventory: Array<{ address: string; label: string; type: string; meta?: string }>;
}

export interface OscEvent {
  simId: string;
  ts: number;
  direction: "in" | "out";
  fromHost: string;
  fromPort: number;
  address: string;
  rawHex: string;
  replyData?: string;
  error?: string;
  latencyMs: number;
  dropped: boolean;
}

declare global {
  interface Window {
    bridge: {
      process: {
        start: (id: "runLocal" | "ngrok") => Promise<unknown>;
        stop: (id: "runLocal" | "ngrok") => Promise<unknown>;
        restart: (id: "runLocal" | "ngrok") => Promise<unknown>;
        stopAll: () => Promise<unknown>;
        getStatuses: () => Promise<ProcessStatus[]>;
        onStatus: (fn: (s: unknown) => void) => () => void;
        onLog: (fn: (e: unknown) => void) => () => void;
        onNgrokUrl: (fn: (url: string) => void) => () => void;
      };
      sim: {
        start: (cfg: unknown) => Promise<{ ok: boolean; error?: string }>;
        stop: (id: string) => Promise<unknown>;
        list: () => Promise<string[]>;
        events: (simId: string) => Promise<OscEvent[]>;
        profiles: () => Promise<SimulatorProfile[]>;
        onEvent: (fn: (ev: unknown) => void) => () => void;
        onError: (fn: (ev: unknown) => void) => () => void;
      };
      settings: {
        get: () => Promise<AppSettings>;
        set: (p: Partial<AppSettings>) => Promise<AppSettings>;
        onUpdated: (fn: (s: unknown) => void) => () => void;
      };
      preset: {
        list: () => Promise<SimulatorPreset[]>;
        save: (name: string) => Promise<SimulatorPreset>;
        load: (id: string) => Promise<AppSettings & { runningIds: string[] }>;
        delete: (id: string) => Promise<void>;
        rename: (id: string, newName: string) => Promise<SimulatorPreset>;
        reorder: (orderedIds: string[]) => Promise<SimulatorPreset[]>;
      };
      updater: {
        onStatus: (fn: (s: unknown) => void) => () => void;
        check: () => Promise<void>;
        install: () => Promise<void>;
      };
      dialog: {
        openFile: (opts: {
          title?: string;
          filters?: Array<{ name: string; extensions: string[] }>;
        }) => Promise<string | null>;
      };
    };
  }
}
