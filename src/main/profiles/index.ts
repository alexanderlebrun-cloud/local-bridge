/* ─── OSC profile definitions ───────────────────────────────────────
 * Each profile describes a fake device:
 *   - id / name / description / defaultPort
 *   - systems   (Level 1: which big boxes are present)
 *   - capabilities (Level 2: what command classes are supported)
 *   - inventory  (Level 3: actual triggerable targets)
 *   - handleAddress(addr): string | null
 *       Returns a JSON string to embed as an OSC string arg,
 *       or null if the address is not handled by this profile.
 * ─────────────────────────────────────────────────────────────────── */

export interface ProfileInventoryItem {
  address: string;
  label: string;
  type: string;
  meta?: string;
}

export interface SimulatorProfile {
  id: string;
  name: string;
  description: string;
  defaultPort: number;
  icon: string;
  systems: string[];
  capabilities: string[];
  inventory: ProfileInventoryItem[];
  handleAddress(address: string): string | null;
}

/* ── Generic OSC ──────────────────────────────────────────────────── */
const generic: SimulatorProfile = {
  id: "generic",
  name: "Generic OSC Device",
  description: "Responds ACK to any OSC address.",
  defaultPort: 9000,
  icon: "radio",
  systems: ["Generic OSC Node"],
  capabilities: ["ACK any address"],
  inventory: [
    { address: "/cwos/ping", label: "Ping", type: "utility" },
    { address: "/cwos/show/segment", label: "Show Segment", type: "cue" },
  ],
  handleAddress(_addr: string): string | null {
    return JSON.stringify({ status: "ok", data: null });
  },
};

/* ── QLab 4 / 5 ───────────────────────────────────────────────────── */
const qlab: SimulatorProfile = {
  id: "qlab",
  name: "QLab 4 / 5",
  description: "Full workspace, cue list and cue inventory. Discovery via UDP.",
  defaultPort: 53000,
  icon: "layers",
  systems: ["QLab 5.2 (Simulated)"],
  capabilities: [
    "workspace/go", "workspace/stop", "workspace/panic",
    "cue/start", "cue/stop", "cue/pause",
    "workspaces query", "cuelist query", "cues query",
  ],
  inventory: [
    { address: "/qlab/workspace/sim-ws-1/go", label: "[SIM] Main Show — GO", type: "workspace" },
    { address: "/qlab/workspace/sim-ws-1/stop", label: "[SIM] Main Show — Stop", type: "workspace" },
    { address: "/qlab/cue/Intro Video/start", label: "Cue 1: Intro Video — Start", type: "cue" },
    { address: "/qlab/cue/Title Card/start", label: "Cue 2: Title Card — Start", type: "cue" },
    { address: "/qlab/cue/Music: Overture/start", label: "Cue 10: Music: Overture — Start", type: "cue" },
    { address: "/qlab/cue/House to Show/start", label: "Cue 20: House to Show — Start", type: "cue" },
    { address: "/qlab/cue/Act 1 Open/start", label: "Cue 30: Act 1 Open — Start", type: "cue" },
    { address: "/qlab/cue/Intermission/start", label: "Cue 50: Intermission — Start", type: "cue" },
  ],
  handleAddress(address: string): string | null {
    if (address === "/qlab/workspaces") {
      return JSON.stringify({
        status: "ok",
        data: [{ uniqueID: "sim-ws-1", displayName: "[SIM] Main Show" }],
      });
    }
    if (address.match(/^\/qlab\/workspace\/[^/]+\/cuelists$/)) {
      return JSON.stringify({
        status: "ok",
        data: [
          { uniqueID: "list-act1", name: "Act 1", listName: "Act 1" },
          { uniqueID: "list-act2", name: "Act 2", listName: "Act 2" },
          { uniqueID: "list-util", name: "Utility", listName: "Utility" },
        ],
      });
    }
    if (address.match(/^\/qlab\/workspace\/[^/]+\/cues$/)) {
      return JSON.stringify({
        status: "ok",
        data: [
          { number: "1",  name: "Intro Video",      type: "video",  colorName: "blue",   isBroken: false },
          { number: "2",  name: "Title Card",        type: "video",  colorName: "blue",   isBroken: false },
          { number: "10", name: "Music: Overture",   type: "audio",  colorName: "green",  isBroken: false },
          { number: "20", name: "House to Show",     type: "osc",    colorName: "orange", isBroken: false },
          { number: "30", name: "Act 1 Open",        type: "video",  colorName: "blue",   isBroken: false },
          { number: "50", name: "Intermission",      type: "osc",    colorName: "orange", isBroken: false },
        ],
      });
    }
    if (address.match(/^\/qlab\//)) {
      return JSON.stringify({ status: "ok", data: null });
    }
    return null;
  },
};

/* ── Q-SYS Core ───────────────────────────────────────────────────── */
const qsys: SimulatorProfile = {
  id: "qsys",
  name: "Q-SYS Core",
  description: "Audio zone, gain, mute, routing and snapshot OSC control.",
  defaultPort: 1702,
  icon: "volume-2",
  systems: ["Q-SYS Core 110f (Simulated)"],
  capabilities: ["gain", "mute", "zone level", "router selection", "snapshot load"],
  inventory: [
    { address: "/qsys/gain/FOH Main",       label: "Gain: FOH Main",    type: "control_template", meta: "Float 0.0–1.0" },
    { address: "/qsys/gain/Stage Monitor",  label: "Gain: Stage Monitor", type: "control_template" },
    { address: "/qsys/mute/FOH Main",       label: "Mute: FOH Main",    type: "control_template", meta: "Int 0/1" },
    { address: "/zones/Lobby/level",        label: "Zone: Lobby Level", type: "zone_template" },
    { address: "/zones/Hallway/level",      label: "Zone: Hallway Level", type: "zone_template" },
    { address: "/zones/Stage/level",        label: "Zone: Stage Level", type: "zone_template" },
    { address: "/qsys/snapshot/Show Start/load", label: "Snapshot: Show Start", type: "snapshot_template" },
    { address: "/qsys/snapshot/Intermission/load", label: "Snapshot: Intermission", type: "snapshot_template" },
  ],
  handleAddress(address: string): string | null {
    if (address.match(/^\/qsys\//) || address.match(/^\/zones\//)) {
      return JSON.stringify({ status: "ok", data: null });
    }
    return null;
  },
};

/* ── ETC Eos ──────────────────────────────────────────────────────── */
const eos: SimulatorProfile = {
  id: "eos",
  name: "ETC Eos",
  description: "Lighting console: cue fire, submaster bump, macro, channel.",
  defaultPort: 3032,
  icon: "sun",
  systems: ["ETC Eos v3.2 (Simulated)"],
  capabilities: ["cue fire", "submaster bump", "macro fire", "group select", "channel intensity"],
  inventory: [
    { address: "/eos/cue/1/1/fire",   label: "Cue List 1, Cue 1 — Fire",  type: "cue_template" },
    { address: "/eos/cue/1/5/fire",   label: "Cue List 1, Cue 5 — Fire",  type: "cue_template" },
    { address: "/eos/cue/1/10/fire",  label: "Cue List 1, Cue 10 — Fire", type: "cue_template" },
    { address: "/eos/cue/1/20/fire",  label: "Cue List 1, Cue 20 — Fire (Blackout)", type: "cue_template" },
    { address: "/eos/sub/1/bump",     label: "Submaster 1 — Bump",        type: "sub_template" },
    { address: "/eos/sub/2/bump",     label: "Submaster 2 — Bump",        type: "sub_template" },
    { address: "/eos/macro/100/fire", label: "Macro 100 — Fire",          type: "macro_template" },
    { address: "/eos/group/1/select", label: "Group 1 — Select",          type: "group_template" },
  ],
  handleAddress(address: string): string | null {
    if (address.match(/^\/eos\//)) {
      return JSON.stringify({ status: "ok", data: null });
    }
    return null;
  },
};

/* ── DMX / Art-Net Gateway ────────────────────────────────────────── */
const dmx: SimulatorProfile = {
  id: "dmx",
  name: "DMX / Art-Net Gateway",
  description: "Universe routing, fixture groups, and scene recall over OSC.",
  defaultPort: 9001,
  icon: "zap",
  systems: ["DMX Art-Net Gateway (Simulated)", "Universe 1: Stage", "Universe 2: FOH"],
  capabilities: ["universe set", "fixture value", "scene recall", "blackout"],
  inventory: [
    { address: "/dmx/1/scene/Show Start",   label: "U1 Scene: Show Start",  type: "scene_template" },
    { address: "/dmx/1/scene/Blue Wash",    label: "U1 Scene: Blue Wash",   type: "scene_template" },
    { address: "/dmx/1/scene/Blackout",     label: "U1 Scene: Blackout",    type: "scene_template" },
    { address: "/dmx/1/fixture/20/value",   label: "U1 Fixture Group 20",   type: "fixture_template", meta: "Float 0.0–1.0" },
    { address: "/dmx/2/scene/Corridor On",  label: "U2 Scene: Corridor On", type: "scene_template" },
    { address: "/dmx/blackout",             label: "Global Blackout",        type: "utility" },
  ],
  handleAddress(address: string): string | null {
    if (address.match(/^\/dmx\//)) {
      return JSON.stringify({ status: "ok", data: null });
    }
    return null;
  },
};

/* ── 7th Sense / Media Server ─────────────────────────────────────── */
const mediaServer: SimulatorProfile = {
  id: "mediaServer",
  name: "7th Sense / Media Server",
  description: "Screen, timeline, and cue control via OSC.",
  defaultPort: 7765,
  icon: "monitor",
  systems: ["7th Sense Delta Server (Simulated)", "Screen 1: Stage", "Screen 2: Onstage Left", "Screen 3: Onstage Right"],
  capabilities: ["screen select", "timeline control", "cue trigger", "opacity", "play/pause/stop"],
  inventory: [
    { address: "/7thsense/screen/1/show",          label: "Screen 1 — Show",        type: "screen" },
    { address: "/7thsense/screen/1/hide",          label: "Screen 1 — Hide",        type: "screen" },
    { address: "/7thsense/screen/2/show",          label: "Screen 2 — Show",        type: "screen" },
    { address: "/7thsense/timeline/Main Loop/play", label: "Timeline: Main Loop — Play", type: "timeline" },
    { address: "/7thsense/timeline/Main Loop/stop", label: "Timeline: Main Loop — Stop", type: "timeline" },
    { address: "/7thsense/cue/Fade Out/trigger",   label: "Cue: Fade Out — Trigger", type: "cue" },
    { address: "/7thsense/cue/Intro Sting/trigger", label: "Cue: Intro Sting — Trigger", type: "cue" },
  ],
  handleAddress(address: string): string | null {
    if (address.match(/^\/7thsense\//)) {
      return JSON.stringify({ status: "ok", data: null });
    }
    return null;
  },
};

/* ── Laser Controller stub ────────────────────────────────────────── */
const laser: SimulatorProfile = {
  id: "laser",
  name: "Laser Controller (stub)",
  description: "Safety-restricted mock-only mode. Presets only. Never routes to real hardware.",
  defaultPort: 7770,
  icon: "alert-triangle",
  systems: ["Laser Controller — MOCK-ONLY (Simulated)"],
  capabilities: ["preset recall (mock)", "enable/disable (mock)"],
  inventory: [
    { address: "/laser/preset/1", label: "Preset 1 — MOCK",    type: "preset", meta: "safety: restricted" },
    { address: "/laser/preset/2", label: "Preset 2 — MOCK",    type: "preset", meta: "safety: restricted" },
    { address: "/laser/preset/3", label: "Preset 3 — MOCK",    type: "preset", meta: "safety: restricted" },
    { address: "/laser/enable",   label: "Enable — MOCK",      type: "control", meta: "safety: restricted" },
    { address: "/laser/disable",  label: "Disable — MOCK",     type: "control", meta: "safety: restricted" },
  ],
  handleAddress(address: string): string | null {
    if (address.match(/^\/laser\//)) {
      return JSON.stringify({ status: "ok", data: "[MOCK] laser command received — not routed to hardware" });
    }
    return null;
  },
};

export const PROFILES: Record<string, SimulatorProfile> = {
  generic,
  qlab,
  qsys,
  eos,
  dmx,
  mediaServer,
  laser,
};

export const PROFILE_LIST = Object.values(PROFILES);
