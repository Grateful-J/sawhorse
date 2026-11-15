#!/usr/bin/env python3
"""Compare layer-encoded hole intent with saved Carbide Create drilling settings.

Read-only diagnostic, not a G-code interpreter or a safety approval. Use a closed project.
"""
import json
import math
import re
import sqlite3
import sys
import zlib
from contextlib import closing
from pathlib import Path

LAYER = re.compile(r"^(?:FLIP_)?DRILL_D(\d+(?:[.P]\d+)?)MM_(THRU|\d+(?:[.P]\d+)?MM)(?:__POCKET_(?:WITH_[A-Z0-9_]+|TOOL_UNSET))?$")


def number(value, name):
    value = float(value.replace("P", ".") if isinstance(value, str) else value)
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"invalid {name}")
    return value


def inspect(path):
    uri = Path(path).resolve().as_uri() + "?mode=ro&immutable=1"
    with closing(sqlite3.connect(uri, uri=True)) as db:
        settings = dict(db.execute("SELECT key, value FROM params"))
        rows = db.execute("SELECT id, type, sz, data FROM items WHERE type IN ('layer', 'toolpath')").fetchall()
    thickness = number(settings["thickness"], "stock thickness")
    layers, operations = {}, []
    for ident, kind, size, data in rows:
        if not isinstance(size, int) or not 0 <= size <= 10_000_000:
            raise ValueError(f"item {ident}: invalid size")
        decoder = zlib.decompressobj()
        raw = decoder.decompress(data, size + 1)
        if len(raw) != size or not decoder.eof or decoder.unused_data:
            raise ValueError(f"item {ident}: invalid compressed data")
        obj = json.loads(raw)
        if kind == "layer":
            layers[obj["uuid"]] = obj.get("name", "")
        elif obj.get("type") == "drilling_toolpath" and obj.get("enabled", True):
            operations.append((ident, obj))
    if not operations:
        raise ValueError("no enabled drilling toolpaths to inspect")
    findings = []
    for ident, op in operations:
        tool = number(op["tool"]["diameter"], "cutter diameter")
        end = number(op["end_depth"], "end depth")
        start = float(op["start_depth"])
        if not math.isfinite(start) or start < 0 or start >= end:
            raise ValueError(f"toolpath {ident}: unsupported start depth")
        if op.get("elements"):
            raise ValueError(f"toolpath {ident}: direct element selection is not supported")
        selection = op.get("toolpath_layers")
        if not isinstance(selection, list) or not selection or any(key not in layers for key in selection):
            raise ValueError(f"toolpath {ident}: missing or unknown layer selection")
        for key in selection:
            layer = layers[key]
            match = LAYER.fullmatch(layer)
            if not match:
                raise ValueError(f"toolpath {ident}: unsupported drill layer {layer!r}")
            diameter, depth = number(match.group(1), "layer diameter"), match.group(2)
            name = op.get("name", str(ident))
            if abs(tool - diameter) > 0.01:
                findings.append(f"{name}: {layer} calls for {diameter:g} mm holes but the drilling tool is {tool:g} mm")
            target = thickness if depth == "THRU" else number(depth[:-2], "layer depth")
            if depth == "THRU" and end < target - 0.01:
                findings.append(f"{name}: {layer} calls for through holes but end depth {end:g} mm is less than project stock thickness {target:g} mm")
            elif depth != "THRU" and abs(end - target) > 0.01:
                findings.append(f"{name}: {layer} calls for depth {target:g} mm but end depth is {end:g} mm")
    return findings


def main():
    if len(sys.argv) != 2:
        print("usage: python3 scripts/check-c2d-drilling.py PROJECT.c2d", file=sys.stderr)
        return 2
    try:
        findings = inspect(sys.argv[1])
    except (sqlite3.Error, OSError, ValueError, TypeError, KeyError, zlib.error) as exc:
        print(f"Cannot inspect project: {exc}", file=sys.stderr)
        return 2
    for finding in findings:
        print(finding)
    print(f"{len(findings)} drilling setting mismatches found. This does not verify toolpaths, physical stock or safety.")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
