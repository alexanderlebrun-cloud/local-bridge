# CWOS Local Bridge

A macOS desktop companion to **CWOS Lab** — manages the two Mac-side processes you need for live show production, and provides a fake-hardware simulator lab so you can develop and test full show control flows without any physical equipment.

---

## What it does

### Service Manager tab
- **Start / Stop** `run-local.sh` (Python Whisper audio analyzer) and `ngrok` tunnel from one UI
- Per-process scrolling log pane with ANSI-aware line colouring
- Auto-extracts the **ngrok public URL** and displays it with one-click copy
- Tray icon turns **green** when both processes are running, **yellow** when partial, **red** on error
- Closing the window hides it to the menu bar; quit only from the tray menu

### Show Control Simulator tab
- Registry of profile-based fake devices — multiple simulators can run simultaneously
- Each simulator listens on **localhost only** — never routable through ngrok or any public interface
- Per-device config: name, port, latency (ms), error rate (%), discoverable toggle
- Live OSC event log per device: every packet received from CWOS + the reply sent back
- **CWOS auto-discovery reliably finds enabled simulated devices** as if they were real hardware

**Built-in profiles:**
| Profile | Default Port | Level 1 | Level 2 | Level 3 inventory |
|---|---|---|---|---|
| Generic OSC | 9000 | Generic Node | ACK any | /cwos/ping, /cwos/show/segment |
| QLab 4 / 5 | 53000 | QLab workspace | workspace/go, cue start/stop | 2 cue lists, 6 cue stubs |
| Q-SYS Core | 1702 | Q-SYS Core 110f | gain, mute, zone level, snapshot | 3 zones, 2 presets |
| ETC Eos | 3032 | Eos v3.2 | cue fire, sub bump, macro, channel | 4 cues, 2 subs, 1 macro |
| DMX / Art-Net | 9001 | Art-Net Gateway | universe, scene recall, blackout | 5 scenes, 1 fixture group |
| 7th Sense | 7765 | Delta Server | screen, timeline, cue | 3 screens, 2 timelines, 2 cues |
| Laser stub | 7770 | MOCK-ONLY | presets (mock) | 3 presets — never routes to hardware |

---

## Three-level discovery

When CWOS runs auto-discovery, the simulator responds with the full payload at all three levels:

1. **Systems** — which big control boxes are present (QLab workspace, Q-SYS Core, etc.)
2. **Capabilities** — what command classes each system supports
3. **Show object inventory** — the actual triggerable targets (cues, zones, scenes, presets)

This means the CWOS Trigger Canvas and Show Player find simulated devices and populate real address templates — identical to real hardware.

---

## Download

Pre-built DMG installers are published as GitHub Release assets every time a `v*` tag is pushed, and as downloadable workflow artifacts on every manual CI run.

| Build | Who needs it |
|---|---|
| `CWOS Local Bridge-*-arm64.dmg` | Apple Silicon Mac (M1 / M2 / M3 / M4) |
| `CWOS Local Bridge-*-x64.dmg` | Intel Mac |

**Install:** open the `.dmg`, drag to `/Applications`.  
**First launch:** double-click to launch — tagged releases are signed and notarized, so no Gatekeeper warning.

> **Unsigned builds** (manual CI runs without secrets, or local `pnpm package` without `CSC_LINK` set) will
> show a Gatekeeper warning on first launch. Right-click → **Open** to bypass it, or set
> `CSC_IDENTITY_AUTO_DISCOVERY=false` to suppress the signing attempt entirely.

---

## One-time setup

### Requirements
- macOS 12 Monterey or later (arm64 / Apple Silicon recommended)
- ngrok account + authtoken configured (`ngrok config add-authtoken <token>`)
- Python 3.10+ with the `analyzer.py` dependencies installed
- Node.js 20+ and pnpm (development builds only)

### Dev build (no code-signing)
```bash
cd tools/cwos-local-bridge
pnpm install
pnpm dev
```

### Build DMG locally (macOS only)
```bash
cd tools/cwos-local-bridge
pnpm install
pnpm package
# Output: dist/CWOS Local Bridge-0.1.0-arm64.dmg
#         dist/CWOS Local Bridge-0.1.0-x64.dmg
```

> **CI builds** — pushing a `v*` tag triggers `.github/workflows/build-mac.yml`, which
> runs on `macos-latest` and calls `pnpm package` with code-signing and notarization enabled.
> `resources/icon.icns` is **pre-built and committed** to the repo (11 sizes, 16 px–1024 px),
> so no macOS-only `sips`/`iconutil` tooling is needed in CI.
> To regenerate the icon after updating `resources/icon.png`, run:
> `python3 tools/cwos-local-bridge/scripts/gen-icns.py`
> The resulting DMGs are uploaded as release assets and a GitHub Release is created automatically.

---

### Code-signing & notarization (maintainers)

Tagged releases are **signed and notarized** so users receive Gatekeeper-clean DMGs and
`electron-updater` can verify the update signature before installing it. Unsigned builds
silently fail to update on macOS — signing is required for auto-update to work.

All credentials are stored as **GitHub Actions repository secrets**:

| Secret | Where to get it | Purpose |
|---|---|---|
| `CSC_LINK` | Export Developer ID Application cert from Keychain → base64-encode the `.p12` file | Code-signing identity passed to `electron-builder` |
| `CSC_KEY_PASSWORD` | The passphrase you set when exporting the `.p12` | Unlocks the certificate |
| `APPLE_ID` | Your Apple ID email address (the account enrolled in the Apple Developer Program) | Notarization auth |
| `APPLE_APP_SPECIFIC_PASSWORD` | Generate at [appleid.apple.com](https://appleid.apple.com) → App-Specific Passwords | Notarization auth |
| `APPLE_TEAM_ID` | 10-character string shown in your Apple Developer account → Membership | Selects the right notarization identity |

> **Unsigned local builds** — set `CSC_IDENTITY_AUTO_DISCOVERY=false` before running
> `pnpm package` to skip signing entirely:
> ```bash
> CSC_IDENTITY_AUTO_DISCOVERY=false pnpm package
> ```

#### Auto-update wiring

`electron-updater` discovers new releases via the `publish` block in `electron-builder.yml`:

```yaml
publish:
  - provider: github
    owner: cwos
    repo: local-bridge
```

**`owner` / `repo` must match the GitHub org/repo where `build-mac.yml` runs.**
`build-mac.yml` validates this at build time — it compares these values against
`$GITHUB_REPOSITORY` and fails the job if they differ, so a mismatch is caught before
any release is published.

To relocate releases to a different repo, update both `owner`/`repo` in `electron-builder.yml`
and re-add all five secrets to the new repo.

#### Verifying a release update end-to-end

1. Push a `v*` tag → wait for the CI run to complete and the GitHub Release to appear.
2. Install the *previous* DMG on a test Mac.
3. Launch the app — it calls the GitHub Releases API on startup.
4. Within ~30 s the app should show an **"Update available"** prompt.
5. Accept → the update downloads, verifies the signature, and relaunches automatically.

### First launch
1. Open the app — it lands on **Service Manager**
2. Click **Browse…** next to `run-local.sh` and locate `artifacts/api-server/python/run-local.sh`
3. Click **Browse…** next to `ngrok binary` (leave blank if `ngrok` is in your PATH)
4. Adjust **Analyzer port** if you changed the default (8001)
5. Click **▶ Start All**

---

## Safety invariants
- Simulator UDP servers bind to `127.0.0.1:PORT` — the OS never routes these packets off the machine
- The Laser Controller profile is a permanent mock stub; it logs every command but never opens any socket to real laser control hardware
- Processes are killed via full process-group SIGTERM → SIGKILL escalation to prevent orphaned children

---

## Architecture

```
CWOS Lab (Replit)
    │
    │  HTTPS / WSS
    │
ngrok tunnel ──→ localhost:8001
                      │
              run-local.sh ──→ python3 analyzer.py
                                  (Whisper, audio analysis)

CWOS Lab (Show Control)
    │
    │  OSC / UDP → localhost:53000 (QLab sim)
    │  OSC / UDP → localhost:1702  (Q-SYS sim)
    │  MTC / UDP → localhost:9001  (TC output)
    │
    └─ SimulatorEngine (this app)
         ├── QLab 4/5 simulator  :53000
         ├── Q-SYS simulator     :1702
         ├── ETC Eos simulator   :3032
         └── … more profiles
```
