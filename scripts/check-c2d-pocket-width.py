#!/usr/bin/env python3
"""Find pockets whose bounding box is narrower than their selected cutter.

Read-only diagnostic, not a CAM interpreter or a machining safety check. It reports
only a necessary condition: a wide bounding box does not prove a cutter fits.
"""
import json
import math
import sqlite3
import sys
import zlib
from contextlib import closing
from pathlib import Path


def inspect(path):
    uri = Path(path).resolve().as_uri() + "?mode=ro&immutable=1"
    with closing(sqlite3.connect(uri, uri=True)) as db:
        rows = db.execute("SELECT id, type, sz, data FROM items WHERE type IN ('layer', 'element', 'toolpath')").fetchall()
    layers, paths, operations = {}, [], []
    for ident, kind, size, data in rows:
        if not isinstance(size, int) or size < 0 or size > 10_000_000:
            raise ValueError(f"item {ident}: unsupported size")
        decoder = zlib.decompressobj()
        raw = decoder.decompress(data, size + 1)
        if len(raw) != size or not decoder.eof or decoder.unused_data:
            raise ValueError(f"item {ident}: invalid compressed data")
        obj = json.loads(raw)
        if kind == "layer":
            layers[obj["uuid"]] = obj.get("name", "")
        elif kind == "element":
            paths.append((ident, obj))
        elif obj.get("type") == "pocket_toolpath" and obj.get("enabled", True):
            operations.append((ident, obj))

    if not operations:
        raise ValueError("no enabled pocket toolpaths to inspect")
    findings = []
    for ident, op in operations:
        diameter = op["tool"]["diameter"]
        if not isinstance(diameter, (int, float)) or not math.isfinite(diameter) or diameter <= 0:
            raise ValueError(f"toolpath {ident}: invalid tool diameter")
        if op.get("elements"):
            raise ValueError(f"toolpath {ident}: direct element selection is not supported")
        selected = op.get("toolpath_layers")
        if not isinstance(selected, list) or not selected or any(key not in layers for key in selected):
            raise ValueError(f"toolpath {ident}: missing or unknown layer selection")
        matching = [(i, obj) for i, obj in paths if obj.get("layer", {}).get("uuid") in selected]
        if not matching:
            raise ValueError(f"toolpath {ident}: selected layers contain no paths")
        for item, shape in matching:
            if shape.get("geometryType") != "path":
                raise ValueError(f"item {item}: unsupported geometry")
            points = sum((shape.get(key, []) for key in ("points", "cp1", "cp2")), [])
            if not points or any(not isinstance(p, list) or len(p) != 2 or any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in p) for p in points):
                raise ValueError(f"item {item}: invalid geometry")
            span = min(max(p[axis] for p in points) - min(p[axis] for p in points) for axis in (0, 1))
            if span < diameter:
                findings.append({"toolpath": op.get("name", str(ident)), "layer": shape["layer"].get("name", ""), "item": item, "span_mm": span, "diameter_mm": diameter})
    return findings


def main():
    if len(sys.argv) != 2:
        print("usage: python3 scripts/check-c2d-pocket-width.py PROJECT.c2d", file=sys.stderr)
        return 2
    try:
        findings = inspect(sys.argv[1])
    except (sqlite3.Error, OSError, ValueError, TypeError, KeyError, zlib.error) as exc:
        print(f"Cannot inspect project: {exc}", file=sys.stderr)
        return 2
    for f in findings:
        print(f"{f['toolpath']}: {f['layer']} item {f['item']} spans at most {f['span_mm']:.4f} mm on one axis; cutter diameter is {f['diameter_mm']:.4f} mm")
    print(f"{len(findings)} narrow bounding boxes found. This does not establish whether any other pocket is machinable or safe.")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
