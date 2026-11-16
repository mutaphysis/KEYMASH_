# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "pillow"]
# ///
"""Packs the library into what the mode loads: a few sprite atlases, the repeating textures, and a manifest.

Everything it needs comes from the plan (`plan.json`, written by 12-library.ts from ASSETS.md's rules): each
sheet's type, atlas group, size, density, sequences and drops. Per cell it

- checks (ASSETS.md, Checks): `cut` and `fragment` reject a cell, `base`, `count` and `density` warn;
- sizes: the frame's on-screen size (longest side, view units) comes from its type (one factor per sheet, per cell
  or per sequence), its texels are that size × density, never more than the source, never over 2048;
- records `s`, view units per texel, so renderers draw it at its on-screen size whatever its texel size.

Groups become atlases (one GL texture each, so a layer draws from one texture). Sprites are shelf-packed, tallest
first, 16 px apart, so the mip blur (depth of field) of one sprite never reaches its neighbour. Repeating textures
(soils) stay single images: GL repeat works on whole textures only.

Usage: uv run scripts/forest/matte/pack.py <library-dir> <out-dir> [--ts <manifest.ts>]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

GAP = 16
MAX_SIDE = 2048
# trees are big: a 4096 page holds the trunks in one shelf
PAGE = {"trees": 4096}
CUT = 0.03  # share of a side a subject may touch before it counts as crossing the grid
FRAGMENT = 0.1  # of the sheet's median area
WIDE_BASE = 0.7


def shelf_pack(sizes: list[tuple[int, int]], page: int) -> list[tuple[int, int, int]]:
    """(page index, x, y) per sprite; tallest first, left to right in shelves."""
    order = sorted(range(len(sizes)), key=lambda i: -sizes[i][1])
    out: list[tuple[int, int, int] | None] = [None] * len(sizes)
    p, x, y, shelf = 0, GAP, GAP, 0
    for i in order:
        w, h = sizes[i]
        if x + w + GAP > page:
            x, y, shelf = GAP, y + shelf + GAP, 0
        if y + h + GAP > page:
            p, x, y, shelf = p + 1, GAP, GAP, 0
        out[i] = (p, x, y)
        x += w + GAP
        shelf = max(shelf, h)
    return out  # type: ignore[return-value]


def crop_page(img: np.ndarray) -> np.ndarray:
    """Trims an atlas page to the used area, rounded up to a multiple of 4 (texture-friendly)."""
    ys, xs = np.nonzero(img[..., 3] > 0)
    h = int(-(-(ys.max() + GAP) // 4) * 4)
    w = int(-(-(xs.max() + GAP) // 4) * 4)
    return img[:h, :w]


def check(name: str, sheet: dict, cells: list[dict], report: list[dict]) -> list[dict]:
    """The cells that pass; every rejection and warning goes into the report."""

    def note(level: str, what: str, cell: dict | None, detail: str) -> None:
        report.append({"sheet": name, "cell": cell["index"] if cell else None, "level": level, "check": what, "detail": detail})

    asked = sheet["grid"][0] * sheet["grid"][1]
    if len(cells) != asked:
        note("warn", "count", None, f"{len(cells)} cells, the grid asked for {asked}")
    in_seq = bool(sheet.get("sequences"))
    median = float(np.median([c["area"] for c in cells])) if cells else 0
    keep = []
    for c in cells:
        drop = sheet.get("drop", {}).get(str(c["index"]))
        if drop:
            note("drop", "drop", c, drop)
            continue
        cut = [e for e in ("top", "left", "right") if e not in sheet["edges"] and c["edges"][e] > CUT]
        if cut:
            note("reject", "cut", c, "touches " + ", ".join(f"{e} ({c['edges'][e]:.0%})" for e in cut))
            continue
        if not in_seq and len(cells) >= 3 and c["area"] < median * FRAGMENT:
            note("reject", "fragment", c, f"area {c['area']} px, the sheet's median is {median:.0f}")
            continue
        if not sheet["base"] and c["base"] > WIDE_BASE:
            note("warn", "base", c, f"bottom {c['base']:.0%} as wide as its widest row: something drawn under it?")
        keep.append(c)
    return keep


def screen_sizes(sheet: dict, cells: list[dict]) -> dict[int, float]:
    """Each cell's longest side on screen, in view units, by the type's scale rule."""
    longest = {c["index"]: max(c["w"], c["h"]) for c in cells}
    sizes = {int(k): v for k, v in sheet.get("sizes", {}).items()}
    if sheet["scale"] == "sheet":
        ref = max(longest.values())
        return {i: sizes.get(i, sheet["size"] * n / ref) for i, n in longest.items()}
    if sheet["scale"] == "sequence":
        out = {}
        for seq in sheet["sequences"].values():
            a, b = seq["frames"]
            for c in cells:
                if a <= c["index"] < b:
                    # a height (mushrooms) becomes the longest side
                    out[c["index"]] = seq["size"] * (max(c["w"], c["h"]) / c["h"] if sheet["measure"] == "height" else 1)
        return out
    return {i: sizes.get(i, sheet.get("size")) for i in longest}


def pack(lib: Path, out: Path, ts: Path | None) -> None:
    out.mkdir(parents=True, exist_ok=True)
    plan = json.loads((lib / "plan.json").read_text())
    graded = lib / "graded"
    manifest: dict = {"unitsPerCm": plan["unitsPerCm"], "atlases": {}, "frames": {}, "sequences": {}, "textures": {}}
    report: list[dict] = []
    groups: dict[str, list[str]] = {}
    for name, sheet in plan["sheets"].items():
        if sheet.get("group"):
            groups.setdefault(sheet["group"], []).append(name)

    for group, names in groups.items():
        sprites = []
        for name in names:
            sheet = plan["sheets"][name]
            meta_file = lib / name / "cells.json"
            if not meta_file.exists():
                report.append({"sheet": name, "cell": None, "level": "warn", "check": "missing", "detail": "not cut yet"})
                continue
            cells = check(name, sheet, json.loads(meta_file.read_text())["cells"], report)
            if not cells:
                continue
            screen = screen_sizes(sheet, cells)
            for c in cells:
                size = screen.get(c["index"])
                if size is None:
                    report.append({"sheet": name, "cell": c["index"], "level": "reject", "check": "size", "detail": "no size in the plan"})
                    continue
                src = graded / f"{name}-{c['file']}"
                if not src.exists():
                    src = lib / name / c["file"]
                img = Image.open(src).convert("RGBA")
                n = max(img.size)
                target = size * sheet["density"]
                k = min(1.0, target / n, MAX_SIDE / n)
                if target > n * 1.05 and n < MAX_SIDE:
                    report.append(
                        {"sheet": name, "cell": c["index"], "level": "warn", "check": "density", "detail": f"{n / size:.2f} texels per unit (wants {sheet['density']})"}
                    )
                if k < 1:
                    img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
                frame = f"{name}/{c['index']:02d}"
                units_per_texel = size / max(img.size)
                sprites.append((frame, img, [c["anchor"][0] * k, c["anchor"][1] * k], c.get("foot"), units_per_texel))
            for seq, spec in (sheet.get("sequences") or {}).items():
                a, b = spec["frames"]
                frames = [f"{name}/{c['index']:02d}" for c in cells if a <= c["index"] < b]
                if frames:
                    manifest["sequences"][f"{name}.{seq}"] = frames
        if not sprites:
            continue
        page = PAGE.get(group, 2048)
        places = shelf_pack([s[1].size for s in sprites], page)
        pages = [np.zeros((page, page, 4), np.uint8) for _ in range(max(p for p, _, _ in places) + 1)]
        for (frame, img, anchor, foot, s), (p, x, y) in zip(sprites, places):
            pages[p][y : y + img.height, x : x + img.width] = np.asarray(img)
            manifest["frames"][frame] = {
                "atlas": f"{group}-{p}",
                "x": x,
                "y": y,
                "w": img.width,
                "h": img.height,
                "ax": round(anchor[0], 1),
                "ay": round(anchor[1], 1),
                # view units per texel: drawn at w·s × h·s
                "s": round(s, 5),
                # where a ground strip starts (fraction of the height); the sprite shader fades its sides
                **({"foot": foot} if foot is not None else {}),
            }
        for p, arr in enumerate(pages):
            arr = crop_page(arr)
            file = f"atlas-{group}-{p}.webp"
            Image.fromarray(arr, "RGBA").save(out / file, quality=86, method=6, exact=False)
            manifest["atlases"][f"{group}-{p}"] = {"file": file, "w": arr.shape[1], "h": arr.shape[0], "bytes": (out / file).stat().st_size}
            print(f"{file}: {arr.shape[1]} x {arr.shape[0]}, {(out / file).stat().st_size // 1024} KB")

    for name, sheet in plan["sheets"].items():
        if sheet["kind"] == "textures":
            # soil → soil-0 … soil-3, moss-fill → moss-0 … moss-3
            prefix = sheet["type"].removesuffix("-fill")
            for k, tile in enumerate(sorted((lib / name).glob("tile-*.png"))):
                file = f"tex-{prefix}-{k}.webp"
                img = Image.open(tile).convert("RGB")
                img.save(out / file, quality=84, method=6)
                manifest["textures"][f"{prefix}-{k}"] = {"file": file, "w": img.width, "h": img.height, "bytes": (out / file).stat().st_size}
        elif sheet["kind"] == "ribbon":
            src = lib / name / "ribbon.png"
            if not src.exists():
                continue
            img = Image.open(src).convert("RGBA")
            img = img.crop(img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())
            # ground-strip → ground, ground-strip-b → ground-b
            key = name.replace("ground-strip", "ground")
            file = f"tex-{key}.webp"
            img.save(out / file, quality=86, method=6, exact=False)
            # strips laid along curves: repeat mirrored (they are not seamless), with alpha
            manifest["textures"][key] = {"file": file, "w": img.width, "h": img.height, "bytes": (out / file).stat().st_size, "wrap": "mirror"}

    total = sum(a["bytes"] for a in manifest["atlases"].values()) + sum(t["bytes"] for t in manifest["textures"].values())
    manifest["bytes"] = total
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))
    (out / "report.json").write_text(json.dumps(report, indent=1))
    if ts:
        ts.write_text(
            "// Written by scripts/forest/matte/pack.py: the packed asset library (atlases, frames, sequences, textures).\n"
            f"export const MANIFEST = {json.dumps(manifest, indent=1)} as const;\n"
        )
    for r in report:
        print(f"  {r['level']:6} {r['check']:9} {r['sheet']}{'/' + format(r['cell'], '02d') if r['cell'] is not None else ''}: {r['detail']}")
    print(f"{len(manifest['frames'])} frames, {len(manifest['sequences'])} sequences, {len(manifest['textures'])} textures, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    args = sys.argv[1:]
    ts = Path(args[args.index("--ts") + 1]) if "--ts" in args else None
    pack(Path(args[0]), Path(args[1]), ts)
