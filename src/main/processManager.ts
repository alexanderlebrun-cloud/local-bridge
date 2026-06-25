import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import path from "path";

export type ProcessId = "runLocal" | "ngrok";

export interface ProcessStatus {
  id: ProcessId;
  running: boolean;
  pid?: number;
  ngrokUrl?: string;
  error?: string;
}

export interface ProcessLogLine {
  id: ProcessId;
  line: string;
  ts: number;
}

/* Kill a process tree cross-platform without needing a dependency. */
function killTree(pid: number, signal: "SIGTERM" | "SIGKILL"): void {
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/f", "/t"], { detached: true }).unref();
    } else {
      /* Negative PID sends signal to the whole process group. */
      try {
        process.kill(-pid, signal);
      } catch {
        /* Fallback: kill the PID directly if no process group. */
        process.kill(pid, signal);
      }
    }
  } catch {
    /* Process may already be dead — ignore. */
  }
}

export class ProcessManager extends EventEmitter {
  private procs = new Map<ProcessId, ChildProcess>();
  private status = new Map<ProcessId, ProcessStatus>([
    ["runLocal", { id: "runLocal", running: false }],
    ["ngrok", { id: "ngrok", running: false }],
  ]);
  private runLocalPath = "";
  private ngrokPath = "";
  private ngrokPort = 8001;

  configure(runLocalPath: string, ngrokPath: string, ngrokPort: number): void {
    this.runLocalPath = runLocalPath;
    this.ngrokPath = ngrokPath;
    this.ngrokPort = ngrokPort;
  }

  getStatus(id: ProcessId): ProcessStatus {
    return this.status.get(id)!;
  }

  getAllStatuses(): ProcessStatus[] {
    return [...this.status.values()];
  }

  start(id: ProcessId): void {
    if (this.procs.has(id)) {
      this.log(id, "[bridge] Process already running");
      return;
    }
    if (id === "runLocal") {
      this.spawnRunLocal();
    } else {
      this.spawnNgrok();
    }
  }

  stop(id: ProcessId): void {
    const proc = this.procs.get(id);
    if (!proc || proc.pid === undefined) {
      this.setStatus(id, { running: false });
      return;
    }
    const pid = proc.pid;
    this.log(id, `[bridge] Stopping ${id} (pid ${pid})…`);
    killTree(pid, "SIGTERM");
    /* Escalate to SIGKILL after 3 s if still alive */
    setTimeout(() => {
      if (this.procs.get(id)?.pid === pid) {
        this.log(id, `[bridge] SIGTERM timeout — sending SIGKILL`);
        killTree(pid, "SIGKILL");
      }
    }, 3000);
  }

  restart(id: ProcessId): void {
    this.log(id, `[bridge] Restarting ${id}…`);
    const proc = this.procs.get(id);
    if (proc?.pid !== undefined) {
      const pid = proc.pid;
      killTree(pid, "SIGTERM");
      /* Wait for the process to exit, then restart. */
      proc.once("exit", () => {
        this.procs.delete(id);
        this.start(id);
      });
      /* Escalate after 3 s in case SIGTERM is ignored. */
      setTimeout(() => {
        if (this.procs.get(id)?.pid === pid) killTree(pid, "SIGKILL");
      }, 3000);
    } else {
      this.start(id);
    }
  }

  stopAll(): void {
    this.stop("runLocal");
    this.stop("ngrok");
  }

  /* ── private ──────────────────────────────────────────────────── */

  private spawnRunLocal(): void {
    const scriptPath = this.runLocalPath;
    if (!scriptPath) {
      this.setStatus("runLocal", { running: false, error: "run-local.sh path not configured" });
      this.log("runLocal", "[bridge] ERROR: run-local.sh path not configured — open Setup to configure.");
      return;
    }

    const scriptDir = path.dirname(scriptPath);
    this.log("runLocal", `[bridge] Spawning: ${scriptPath}`);
    this.log("runLocal", `[bridge] Working dir: ${scriptDir}`);

    const proc = spawn("bash", [scriptPath], {
      cwd: scriptDir,
      /* detached: true lets us kill the full process group */
      detached: true,
      env: {
        ...process.env,
        WHISPER_DEFAULT_MODEL: process.env["WHISPER_DEFAULT_MODEL"] ?? "large-v3",
        PYTORCH_ENABLE_MPS_FALLBACK: "1",
        /* Use the configured port so ngrok and analyzer always agree */
        PYTHON_ANALYZER_PORT: String(this.ngrokPort),
        UPLOADS_DIR: path.join(scriptDir, "..", "..", "uploads"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.procs.set("runLocal", proc);
    this.setStatus("runLocal", { running: true, pid: proc.pid });
    this.wireOutput("runLocal", proc);
  }

  private spawnNgrok(): void {
    const ngrokBin = this.ngrokPath || "ngrok";
    this.log("ngrok", `[bridge] Spawning: ${ngrokBin} http ${this.ngrokPort}`);

    const proc = spawn(ngrokBin, ["http", String(this.ngrokPort)], {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.procs.set("ngrok", proc);
    this.setStatus("ngrok", { running: true, pid: proc.pid });
    this.wireOutput("ngrok", proc);
  }

  private wireOutput(id: ProcessId, proc: ChildProcess): void {
    const onData = (data: Buffer): void => {
      const text = data.toString("utf8");
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        this.log(id, line);
        if (id === "ngrok") this.tryExtractNgrokUrl(line);
      }
    };

    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);

    proc.on("exit", (code, signal) => {
      this.log(id, `[bridge] Process exited — code=${code ?? "?"} signal=${signal ?? "none"}`);
      this.procs.delete(id);
      this.setStatus(id, { running: false });
    });

    proc.on("error", (err) => {
      this.log(id, `[bridge] Spawn error: ${err.message}`);
      this.procs.delete(id);
      this.setStatus(id, { running: false, error: err.message });
    });
  }

  private tryExtractNgrokUrl(line: string): void {
    /* ngrok v3 stdout: "Forwarding   https://xxxx.ngrok-free.app -> http://localhost:8001" */
    const m = line.match(/https?:\/\/[a-z0-9-]+\.ngrok(?:-free)?\.app\b/i)
      ?? line.match(/"public_url"\s*:\s*"(https?:\/\/[^"]+)"/i);
    if (m) {
      const url = m[1] ?? m[0];
      const cur = this.status.get("ngrok")!;
      this.setStatus("ngrok", { ...cur, ngrokUrl: url });
      this.emit("ngrok-url", url);
      this.log("ngrok", `[bridge] ✓ Public URL: ${url}`);
    }
  }

  private setStatus(id: ProcessId, partial: Partial<ProcessStatus>): void {
    const cur = this.status.get(id)!;
    const next: ProcessStatus = { ...cur, ...partial, id };
    this.status.set(id, next);
    this.emit("status", next);
  }

  private log(id: ProcessId, line: string): void {
    const entry: ProcessLogLine = { id, line, ts: Date.now() };
    this.emit("log", entry);
  }
}
