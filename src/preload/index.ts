import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";

type UnsubFn = () => void;

const bridge = {
  /* Process manager */
  process: {
    start: (id: "runLocal" | "ngrok") =>
      ipcRenderer.invoke("process:start", id),
    stop: (id: "runLocal" | "ngrok") =>
      ipcRenderer.invoke("process:stop", id),
    restart: (id: "runLocal" | "ngrok") =>
      ipcRenderer.invoke("process:restart", id),
    stopAll: () => ipcRenderer.invoke("process:stopAll"),
    getStatuses: () => ipcRenderer.invoke("process:status"),
    onStatus: (fn: (s: unknown) => void): UnsubFn => {
      const handler = (_: IpcRendererEvent, s: unknown) => fn(s);
      ipcRenderer.on("process:status", handler);
      return () => ipcRenderer.off("process:status", handler);
    },
    onLog: (fn: (entry: unknown) => void): UnsubFn => {
      const handler = (_: IpcRendererEvent, e: unknown) => fn(e);
      ipcRenderer.on("process:log", handler);
      return () => ipcRenderer.off("process:log", handler);
    },
    onNgrokUrl: (fn: (url: string) => void): UnsubFn => {
      const handler = (_: IpcRendererEvent, u: string) => fn(u);
      ipcRenderer.on("process:ngrok-url", handler);
      return () => ipcRenderer.off("process:ngrok-url", handler);
    },
  },

  /* Simulator */
  sim: {
    start: (cfg: unknown) => ipcRenderer.invoke("sim:start", cfg),
    stop: (id: string) => ipcRenderer.invoke("sim:stop", id),
    list: () => ipcRenderer.invoke("sim:list"),
    events: (simId: string) => ipcRenderer.invoke("sim:events", simId),
    profiles: () => ipcRenderer.invoke("sim:profiles"),
    onEvent: (fn: (ev: unknown) => void): UnsubFn => {
      const handler = (_: IpcRendererEvent, ev: unknown) => fn(ev);
      ipcRenderer.on("sim:event", handler);
      return () => ipcRenderer.off("sim:event", handler);
    },
    onError: (fn: (ev: unknown) => void): UnsubFn => {
      const handler = (_: IpcRendererEvent, ev: unknown) => fn(ev);
      ipcRenderer.on("sim:error", handler);
      return () => ipcRenderer.off("sim:error", handler);
    },
  },

  /* Settings */
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (partial: unknown) => ipcRenderer.invoke("settings:set", partial),
    onUpdated: (fn: (s: unknown) => void): UnsubFn => {
      const handler = (_: IpcRendererEvent, s: unknown) => fn(s);
      ipcRenderer.on("settings:updated", handler);
      return () => ipcRenderer.off("settings:updated", handler);
    },
  },

  /* Simulator presets */
  preset: {
    list: () => ipcRenderer.invoke("preset:list"),
    save: (name: string) => ipcRenderer.invoke("preset:save", name),
    load: (id: string) => ipcRenderer.invoke("preset:load", id),
    delete: (id: string) => ipcRenderer.invoke("preset:delete", id),
    rename: (id: string, newName: string) => ipcRenderer.invoke("preset:rename", id, newName),
    reorder: (orderedIds: string[]) => ipcRenderer.invoke("preset:reorder", orderedIds),
  },

  /* Auto-updater */
  updater: {
    onStatus: (fn: (s: unknown) => void): UnsubFn => {
      const handler = (_: IpcRendererEvent, s: unknown) => fn(s);
      ipcRenderer.on("updater:status", handler);
      return () => ipcRenderer.off("updater:status", handler);
    },
    check: () => ipcRenderer.invoke("updater:check"),
    install: () => ipcRenderer.invoke("updater:install"),
  },

  /* Dialogs */
  dialog: {
    openFile: (opts: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
      ipcRenderer.invoke("dialog:openFile", opts),
  },
};

contextBridge.exposeInMainWorld("bridge", bridge);

export type Bridge = typeof bridge;
