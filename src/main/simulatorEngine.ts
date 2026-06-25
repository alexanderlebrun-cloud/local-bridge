import dgram from "dgram";
import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { PROFILES } from "./profiles/index.js";
import type { SimulatorConfig } from "./store.js";

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

/* ── OSC packet utilities ───────────────────────────────────────────── */

function pad4(len: number): number {
  return Math.ceil(len / 4) * 4;
}

function encodeOscString(s: string): Buffer {
  const byteLen = Buffer.byteLength(s, "utf8") + 1;
  const buf = Buffer.alloc(pad4(byteLen), 0);
  buf.write(s, 0, "utf8");
  return buf;
}

function buildOscStringReply(address: string, strArg: string): Buffer {
  const addrBuf = encodeOscString(address);
  const tagBuf = encodeOscString(",s");
  const argBuf = encodeOscString(strArg);
  return Buffer.concat([addrBuf, tagBuf, argBuf]);
}

function buildOscAck(address: string): Buffer {
  const addrBuf = encodeOscString(address);
  const tagBuf = encodeOscString(",");
  return Buffer.concat([addrBuf, tagBuf]);
}

function parseOscAddress(data: Buffer): string {
  try {
    const end = data.indexOf(0, 0);
    return data.toString("utf8", 0, end < 0 ? data.length : end);
  } catch {
    return "?";
  }
}

/* ── Per-simulator server ───────────────────────────────────────────── */

interface SimInstance {
  config: SimulatorConfig;
  socket: dgram.Socket;
  events: OscEvent[];
}

export class SimulatorEngine extends EventEmitter {
  private instances = new Map<string, SimInstance>();

  start(config: SimulatorConfig): { ok: boolean; error?: string } {
    if (this.instances.has(config.id)) {
      return { ok: false, error: "Already running" };
    }

    /* Safety: simulators bind to localhost ONLY — never routable externally */
    const socket = dgram.createSocket("udp4");

    socket.on("error", (err) => {
      this.emit("error", { simId: config.id, error: err.message });
      this.instances.delete(config.id);
    });

    socket.on("message", (msg: Buffer, rinfo: dgram.RemoteInfo) => {
      this.handleMessage(config.id, msg, rinfo);
    });

    socket.bind(config.port, "127.0.0.1");

    this.instances.set(config.id, { config, socket, events: [] });
    return { ok: true };
  }

  stop(id: string): void {
    const inst = this.instances.get(id);
    if (!inst) return;
    try { inst.socket.close(); } catch { /* ignore */ }
    this.instances.delete(id);
  }

  stopAll(): void {
    for (const id of [...this.instances.keys()]) {
      this.stop(id);
    }
  }

  listRunning(): string[] {
    return [...this.instances.keys()];
  }

  getEvents(simId: string, limit = 100): OscEvent[] {
    const inst = this.instances.get(simId);
    if (!inst) return [];
    return inst.events.slice(-limit);
  }

  /* ── message handler ──────────────────────────────────────────── */

  /** Returns true if an OSC address looks like a CWOS auto-discovery probe. */
  private static isDiscoveryProbe(address: string): boolean {
    return (
      address === "/qlab/workspaces" ||
      /^\/qlab\/workspace\/[^/]+\/(cuelists|cues|playbackPosition)$/.test(address) ||
      address === "/cwos/discover" ||
      address === "/cwos/ping"
    );
  }

  private handleMessage(simId: string, msg: Buffer, rinfo: dgram.RemoteInfo): void {
    const inst = this.instances.get(simId);
    if (!inst) return;

    const { config } = inst;
    const profile = PROFILES[config.profileId] ?? PROFILES["generic"]!;

    const address = parseOscAddress(msg);
    const rawHex = msg.toString("hex");
    const ts = Date.now();

    /* Simulate network latency */
    const latencyMs = config.latencyMs + (Math.random() * 10 | 0);

    /* Simulate error rate */
    const dropped = Math.random() * 100 < config.errorRate;

    /* When discoverable is OFF, silently ignore all auto-discovery probes so
     * CWOS auto-sense cannot find this device.  Non-probe OSC commands still
     * pass through so manual-address firing still works. */
    const suppressedByDiscovery =
      !config.discoverable && SimulatorEngine.isDiscoveryProbe(address);

    const eventIn: OscEvent = {
      simId,
      ts,
      direction: "in",
      fromHost: rinfo.address,
      fromPort: rinfo.port,
      address,
      rawHex,
      latencyMs,
      dropped: dropped || suppressedByDiscovery,
    };

    this.recordEvent(inst, eventIn);
    this.emit("event", eventIn);

    /* Drop without reply when error-simulated or discovery suppressed */
    if (dropped || suppressedByDiscovery) return;

    /* Build and send reply after latency */
    setTimeout(() => {
      /* Re-check instance still running */
      const live = this.instances.get(simId);
      if (!live) return;

      const replyData = profile.handleAddress(address);
      let replyPacket: Buffer;

      if (replyData !== null) {
        /* Has a structured JSON payload — send as OSC string arg */
        const replyAddress = address.replace(/^\//, "/reply/");
        replyPacket = buildOscStringReply(replyAddress, replyData);
      } else {
        /* ACK only */
        replyPacket = buildOscAck(address);
      }

      live.socket.send(replyPacket, rinfo.port, rinfo.address, (err) => {
        const eventOut: OscEvent = {
          simId,
          ts: Date.now(),
          direction: "out",
          fromHost: "127.0.0.1",
          fromPort: config.port,
          address: replyData !== null ? address.replace(/^\//, "/reply/") : address,
          rawHex: replyPacket.toString("hex"),
          replyData: replyData ?? undefined,
          error: err?.message,
          latencyMs,
          dropped: false,
        };
        this.recordEvent(live, eventOut);
        this.emit("event", eventOut);
      });
    }, latencyMs);
  }

  private recordEvent(inst: SimInstance, event: OscEvent): void {
    inst.events.push(event);
    if (inst.events.length > 500) inst.events.shift();
  }
}
