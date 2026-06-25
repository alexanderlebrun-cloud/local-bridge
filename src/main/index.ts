import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } from "electron";
import path from "path";
import { autoUpdater } from "electron-updater";
import { ProcessManager, type ProcessId } from "./processManager.js";
import { SimulatorEngine } from "./simulatorEngine.js";
import { loadSettings, saveSettings, type SimulatorPreset } from "./store.js";
import { handlePresetSave, handlePresetLoad, handlePresetDelete, handlePresetRename, handlePresetReorder } from "./presetHandlers.js";
import { PROFILE_LIST } from "./profiles/index.js";

/* ── State ────────────────────────────────────────────────────────── */
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const procMgr = new ProcessManager();
const simEngine = new SimulatorEngine();
let settings = loadSettings();

/* ── Helpers ──────────────────────────────────────────────────────── */

function send(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

/* Load the CWOS branded tray icon from the bundled resources directory.
 * The file is named with the macOS "Template" suffix so the OS handles
 * dark/light mode switching automatically. */
function loadTrayIcon(): nativeImage {
  const iconPath = path.join(
    app.isPackaged
      ? process.resourcesPath
      : path.join(__dirname, "../../resources"),
    "tray-iconTemplate.png",
  );
  const img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) {
    console.warn(`[CWOS] Tray icon not found at: ${iconPath}`);
  }
  img.setTemplateImage(true);
  return img;
}

function updateTrayIcon(): void {
  if (!tray) return;
  const statuses = procMgr.getAllStatuses();
  const anyRunning = statuses.some((s) => s.running);
  const allRunning = statuses.every((s) => s.running);
  const anyError   = statuses.some((s) => s.error);
  const label = anyError ? "Error" : allRunning ? "All running" : anyRunning ? "Partial" : "Stopped";
  tray.setToolTip(`CWOS Local Bridge — ${label}`);
}

/* ── Window factory ───────────────────────────────────────────────── */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 660,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: "#0a0b0f",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
    },
    title: "CWOS Local Bridge",
    show: false,
  });

  /* Hide window on close instead of quitting */
  mainWindow.on("close", (e) => {
    e.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

/* ── Tray setup ───────────────────────────────────────────────────── */
function rebuildTrayMenu(): void {
  if (!tray) return;
  const presets: SimulatorPreset[] = settings.presets ?? [];

  const presetItems: Electron.MenuItemConstructorOptions[] = presets.length === 0
    ? [{ label: "No saved presets", enabled: false }]
    : presets.map((p) => ({
        label: p.name,
        click: () => {
          /* Stop all running simulators before swapping the rig */
          simEngine.stopAll();
          const fresh = p.simulators.map((s) => ({ ...s, enabled: false }));
          settings = { ...settings, simulators: fresh };
          saveSettings(settings);
          /* Tell renderer to replace config AND clear its running set */
          send("settings:updated", { ...settings, runningIds: [] });
          rebuildTrayMenu();
        },
      }));

  const menu = Menu.buildFromTemplate([
    {
      label: "Open CWOS Local Bridge",
      click: () => { mainWindow?.show(); mainWindow?.focus(); },
    },
    { type: "separator" },
    {
      label: "Load Preset",
      submenu: presetItems,
    },
    { type: "separator" },
    {
      label: "Stop All Processes",
      click: () => { procMgr.stopAll(); },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        procMgr.stopAll();
        simEngine.stopAll();
        app.exit(0);
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function createTray(): void {
  const icon = loadTrayIcon();
  tray = new Tray(icon);
  tray.setImage(icon);
  tray.setToolTip("CWOS Local Bridge");
  rebuildTrayMenu();

  tray.on("click", () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow?.show();
    }
  });
}

/* ── Auto-updater ─────────────────────────────────────────────────── */
function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    send("updater:status", { phase: "available", info });
  });
  autoUpdater.on("update-not-available", () => {
    send("updater:status", { phase: "not-available" });
  });
  autoUpdater.on("download-progress", (progress) => {
    send("updater:status", { phase: "downloading", progress });
  });
  autoUpdater.on("update-downloaded", (info) => {
    send("updater:status", { phase: "ready", info });
  });
  autoUpdater.on("error", (err) => {
    send("updater:status", { phase: "error", message: err.message });
  });

  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    /* Silently ignore — common in dev builds without a publish config */
  });
}

/* ── App lifecycle ────────────────────────────────────────────────── */
app.whenReady().then(() => {
  createWindow();
  createTray();
  setupAutoUpdater();

  /* Configure process manager from saved settings */
  procMgr.configure(settings.runLocalPath, settings.ngrokPath, settings.ngrokPort);

  /* Wire process manager events → renderer */
  procMgr.on("status", (s) => {
    send("process:status", s);
    updateTrayIcon();
  });
  procMgr.on("log", (entry) => {
    send("process:log", entry);
  });
  procMgr.on("ngrok-url", (url) => {
    send("process:ngrok-url", url);
  });

  /* Wire simulator events → renderer */
  simEngine.on("event", (ev) => {
    send("sim:event", ev);
  });
  simEngine.on("error", (ev) => {
    send("sim:error", ev);
  });

  /* Re-start any enabled simulators from saved config */
  for (const simCfg of settings.simulators) {
    if (simCfg.enabled) {
      simEngine.start(simCfg);
    }
  }
});

app.on("window-all-closed", () => {
  /* macOS: keep app running in tray even when all windows closed */
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  procMgr.stopAll();
  simEngine.stopAll();
});

/* ── IPC handlers — process manager ──────────────────────────────── */

ipcMain.handle("process:start", (_e, id: ProcessId) => {
  procMgr.start(id);
  return { ok: true };
});

ipcMain.handle("process:stop", (_e, id: ProcessId) => {
  procMgr.stop(id);
  return { ok: true };
});

ipcMain.handle("process:stopAll", () => {
  procMgr.stopAll();
  return { ok: true };
});

ipcMain.handle("process:restart", (_e, id: ProcessId) => {
  procMgr.restart(id);
  return { ok: true };
});

ipcMain.handle("process:status", () => {
  return procMgr.getAllStatuses();
});

/* ── IPC handlers — simulator ─────────────────────────────────────── */

ipcMain.handle("sim:start", (_e, cfg) => {
  return simEngine.start(cfg);
});

ipcMain.handle("sim:stop", (_e, id: string) => {
  simEngine.stop(id);
  return { ok: true };
});

ipcMain.handle("sim:list", () => {
  return simEngine.listRunning();
});

ipcMain.handle("sim:events", (_e, simId: string) => {
  return simEngine.getEvents(simId);
});

ipcMain.handle("sim:profiles", () => {
  return PROFILE_LIST.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    defaultPort: p.defaultPort,
    icon: p.icon,
    systems: p.systems,
    capabilities: p.capabilities,
    inventory: p.inventory,
  }));
});

/* ── IPC handlers — settings ──────────────────────────────────────── */

ipcMain.handle("settings:get", () => {
  return settings;
});

ipcMain.handle("settings:set", (_e, partial: Partial<typeof settings>) => {
  settings = { ...settings, ...partial };
  saveSettings(settings);
  /* Reconfigure process manager if paths changed */
  procMgr.configure(settings.runLocalPath, settings.ngrokPath, settings.ngrokPort);
  rebuildTrayMenu();
  return settings;
});

/* ── IPC handlers — simulator presets ────────────────────────────── */

ipcMain.handle("preset:list", () => {
  return settings.presets ?? [];
});

ipcMain.handle("preset:save", (_e, name: string) => {
  const result = handlePresetSave(settings, name, saveSettings);
  settings = result.settings;
  rebuildTrayMenu();
  return result.preset;
});

ipcMain.handle("preset:load", (_e, id: string) => {
  const result = handlePresetLoad(settings, id, saveSettings, () => simEngine.stopAll());
  /* Strip the renderer-only runningIds field before storing in module state */
  const { runningIds: _unused, ...nextSettings } = result;
  settings = nextSettings;
  return result;
});

ipcMain.handle("preset:delete", (_e, id: string) => {
  settings = handlePresetDelete(settings, id, saveSettings);
  rebuildTrayMenu();
});

ipcMain.handle("preset:rename", (_e, id: string, newName: string) => {
  const updated = handlePresetRename(settings, id, newName, saveSettings);
  settings = { ...settings, presets: (settings.presets ?? []).map((p) => p.id === id ? updated : p) };
  rebuildTrayMenu();
  return updated;
});

ipcMain.handle("preset:reorder", (_e, orderedIds: string[]) => {
  const presets = handlePresetReorder(settings, orderedIds, saveSettings);
  settings = { ...settings, presets };
  rebuildTrayMenu();
  return settings.presets;
});

/* ── IPC handlers — updater ───────────────────────────────────────── */

ipcMain.handle("updater:check", async () => {
  try {
    await autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    send("updater:status", { phase: "error", message: (err as Error).message });
  }
});

ipcMain.handle("updater:install", () => {
  autoUpdater.quitAndInstall();
});

/* ── IPC handlers — dialog ────────────────────────────────────────── */

ipcMain.handle("dialog:openFile", async (_e, opts: { title?: string; filters?: Electron.FileFilter[] }) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: opts.title ?? "Select file",
    properties: ["openFile"],
    filters: opts.filters ?? [{ name: "All Files", extensions: ["*"] }],
  });
  return result.canceled ? null : result.filePaths[0] ?? null;
});
