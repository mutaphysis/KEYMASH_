# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "pillow"]
# ///
"""Step 13's comparison: each illustration style's fly agaric (young, mature, decaying) and eight critters put into a
still of the prototype at true scale (ASSETS.md: fly agaric 75 units, critters 5x life), next to the photographic
library cut-outs. Per style a row: the whole still, and the placed things zoomed 2x.

Usage: uv run scripts/forest/matte/styles.py <13-styles dir> <12-library dir> <still.png> <style>...
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

UNITS_PER_CM = 3.75
ZOOM = 5  # critters, larger than life
GROUND = 440


def ground_at(x: float) -> float:
    """The prototype's ground curve (proto/main.ts groundAt)."""
    return (
        GROUND
        + 16 * math.sin(x * 0.0045 + 1.2)
        + 9 * math.sin(x * 0.013 + 0.4)
        - 46 * math.exp(-(((x - 960) / 170) ** 2))
        + 24 * math.exp(-(((x - 420) / 140) ** 2))
    )


# critter → (x, real length in cm); the styles' sheets list them in this order
CRITTERS = [("beetle", 550, 3), ("woodlouse", 615, 1.6), ("ant", 662, 1.2), ("ladybird", 702, 1), ("snail", 390, 5), ("stag", 475, 4), ("weevil", 742, 1.2), ("spider", 780, 1.2)]
MUSHROOMS = [(4, 205), (7, 255), (9, 310)]  # life frame → x
CROP = (160, 250, 800, 610)


def trimmed(path: Path) -> Image.Image:
    img = Image.open(path).convert("RGBA")
    return img.crop(img.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox())


def cell(dir: Path, index: int) -> Path | None:
    meta = json.loads((dir / "cells.json").read_text())
    for c in meta["cells"]:
        if c.get("index", -1) == index:
            return dir / c["file"]
    return None


def place(scene: Image.Image, img: Image.Image, x: float, size: float, by: str, sink: float = 4) -> None:
    """Scales img so its height (by='h') or longest side is `size` units and stands it on the ground at x."""
    side = img.height if by == "h" else max(img.size)
    k = size / side
    img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    y = ground_at(x) + sink
    scene.alpha_composite(img, (round(x - img.width / 2), round(y - img.height)))


def panel(still: Image.Image, mature: Path | None, life_dir: Path | None, critters: list[Path | None]) -> Image.Image:
    scene = still.convert("RGBA").copy()
    if life_dir:
        # one scale for the whole sequence: the mature frame's height is 75 units
        mature_h = trimmed(cell(life_dir, 7)).height  # type: ignore[arg-type]
        for index, x in MUSHROOMS:
            p = cell(life_dir, index)
            if p:
                img = trimmed(p)
                place(scene, img, x, 20 * UNITS_PER_CM * img.height / mature_h, "h")
    for (name, x, cm), p in zip(CRITTERS, critters):
        if p:
            place(scene, trimmed(p), x, cm * UNITS_PER_CM * ZOOM, "longest")
    return scene.convert("RGB")


def main(styles_dir: Path, lib: Path, still_path: Path, styles: list[str]) -> None:
    still = Image.open(still_path)
    rows = []
    # the photographic library as the reference row
    photo_critters = [cell(lib / "bodies", i) for i in range(4)] + [cell(lib / "snail", 0)] + [cell(lib / "bodies-b", i) for i in (0, 1, 5)]
    rows.append(("photo (library)", panel(still, None, lib / "life-amanita", photo_critters)))
    for style in styles:
        crit_dir = styles_dir / f"{style}-critters"
        life_dir = styles_dir / f"{style}-mushroom"
        crit = [cell(crit_dir, i) for i in range(8)] if (crit_dir / "cells.json").exists() else [None] * 8
        rows.append((style, panel(still, None, life_dir if (life_dir / "cells.json").exists() else None, crit)))
    W, H, PAD, LAB = 960, 540, 12, 28
    sheet = Image.new("RGB", (2 * W + 3 * PAD, len(rows) * (H + LAB + PAD) + PAD), (22, 19, 15))
    d = ImageDraw.Draw(sheet)
    for r, (label, scene) in enumerate(rows):
        y = PAD + r * (H + LAB + PAD)
        d.text((PAD, y + 6), f"{label}: whole view (fly agaric 75 units)  ·  zoomed 2x", fill=(216, 205, 184))
        sheet.paste(scene.resize((W, H), Image.LANCZOS), (PAD, y + LAB))
        sheet.paste(scene.crop(CROP).resize((W, H), Image.LANCZOS), (2 * PAD + W, y + LAB))
    out = styles_dir / "compare.webp"
    sheet.save(out, quality=84, method=6)
    # one full-size still per style, to look at closely
    for label, scene in rows:
        scene.save(styles_dir / f"scene-{label.split(' ')[0]}.png")
    print(out)


if __name__ == "__main__":
    a = sys.argv[1:]
    main(Path(a[0]), Path(a[1]), Path(a[2]), a[3:])
