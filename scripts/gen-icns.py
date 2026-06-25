#!/usr/bin/env python3
"""
Generate resources/icon.icns from resources/icon.png.

Requires ImageMagick (magick command) — available on Linux, macOS, and Windows.
No macOS-only sips/iconutil needed.

Usage:
    python3 tools/cwos-local-bridge/scripts/gen-icns.py
"""

import struct
import subprocess
import sys
import tempfile
import os

REPO_ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "..")
SRC = os.path.join(REPO_ROOT, "tools", "cwos-local-bridge", "resources", "icon.png")
OUT = os.path.join(REPO_ROOT, "tools", "cwos-local-bridge", "resources", "icon.icns")

ICON_TYPES = [
    (b"icp4", 16),
    (b"icp5", 32),
    (b"icp6", 64),
    (b"ic07", 128),
    (b"ic08", 256),
    (b"ic09", 512),
    (b"ic10", 1024),
    (b"ic11", 32),
    (b"ic12", 64),
    (b"ic13", 256),
    (b"ic14", 512),
]


def main():
    if not os.path.exists(SRC):
        print(f"ERROR: source not found: {SRC}", file=sys.stderr)
        sys.exit(1)

    sizes_needed = sorted(set(sz for _, sz in ICON_TYPES))
    tmpdir = tempfile.mkdtemp()
    size_to_png = {}

    for sz in sizes_needed:
        out_png = os.path.join(tmpdir, f"icon_{sz}.png")
        result = subprocess.run(
            ["magick", SRC, "-resize", f"{sz}x{sz}", out_png],
            capture_output=True,
        )
        if result.returncode != 0:
            print(f"ERROR resizing to {sz}px: {result.stderr.decode()}", file=sys.stderr)
            sys.exit(1)
        size_to_png[sz] = out_png
        print(f"  {sz}x{sz}  ok")

    chunks = []
    for ostype, sz in ICON_TYPES:
        png_path = size_to_png[sz]
        with open(png_path, "rb") as f:
            png_data = f.read()
        chunk_len = 8 + len(png_data)
        chunks.append(ostype + struct.pack(">I", chunk_len) + png_data)

    body = b"".join(chunks)
    file_len = 8 + len(body)
    header = b"icns" + struct.pack(">I", file_len)

    with open(OUT, "wb") as f:
        f.write(header + body)

    print(f"\nWrote {OUT} ({file_len:,} bytes, {len(ICON_TYPES)} icon slots)")


if __name__ == "__main__":
    main()
