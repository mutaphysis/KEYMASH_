# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "pillow"]
# ///
"""Step 16's seam preview: per tree the leaf cover as the mode would draw it, from a packed library (pack.py's
manifest): the fill hex-tiled like the moss carpets (shaders/hex.glsl, mossfill.glsl: random offsets, left-right
mirroring, Mikkelsen's luminance blend) and the canopy strip hanging below it, mirrored along x. Both at their
manifest `s`, so the leaves are the same size where they meet. Left the strip's top edge as it is, right handed over
in a height blend (its brightest leaves first). 1 px per view unit.

Usage: uv run scripts/forest/matte/canopy.py <pack-dir> <out.webp>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

TREES = ["birch", "oak", "beech", "maple"]  # canopy-<tree> continues leaf-<n>, in this order (12-library.ts)
W = 1000  # view units per panel
FILL = 220  # units of fill above the strip
HAZE = np.array([0.74, 0.72, 0.64], np.float32)
HEX_K = 3.4641016
CONTRAST = 0.6  # as the moss carpets


def at_scale(path: Path, s: float) -> np.ndarray:
    """A texture resized to view units (1 px each), premultiplied so the cut edges stay clean."""
    img = Image.open(path).convert("RGBA").convert("RGBa")
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS).convert("RGBA")
    return np.asarray(img, np.float32) / 255


def luma(c: np.ndarray) -> np.ndarray:
    return c @ np.array([0.299, 0.587, 0.114], np.float32)


def hash22(v: np.ndarray) -> np.ndarray:
    x = np.sin(v @ np.array([[127.1, 269.5], [311.7, 183.3]], np.float32)) * 43758.5453
    return x - np.floor(x)


def hex_fill(tex: np.ndarray, w: int, h: int) -> np.ndarray:
    """hexGrid + mossTap + hexBlend, per pixel: three patches of the tile at random offsets, some mirrored."""
    th, tw = tex.shape[:2]
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    uv = np.stack([x / tw, y / th], -1)
    st = uv * HEX_K
    sk = np.stack([st[..., 0] - 0.57735027 * st[..., 1], 1.15470054 * st[..., 1]], -1)
    b, f = np.floor(sk), sk - np.floor(sk)
    z = 1 - f[..., 0] - f[..., 1]
    low = (z > 0)[..., None]
    w3 = np.where(low, np.stack([z, f[..., 1], f[..., 0]], -1), np.stack([-z, 1 - f[..., 1], 1 - f[..., 0]], -1))
    verts = [
        np.where(low, b, b + [1, 1]),
        np.where(low, b + [0, 1], b + [1, 0]),
        np.where(low, b + [1, 0], b + [0, 1]),
    ]
    taps = []
    for v in verts:
        hv = hash22(v)
        u = uv + hv
        u[..., 0] = np.where((hv[..., 0] * 13.7) % 1 > 0.5, -u[..., 0], u[..., 0])
        px = ((u[..., 0] % 1) * tw).astype(int) % tw
        py = ((u[..., 1] % 1) * th).astype(int) % th
        taps.append(tex[py, px, :3])
    weights = [(1 - CONTRAST + CONTRAST * luma(c)) * w3[..., i] ** 7 for i, c in enumerate(taps)]
    total = sum(weights)
    return sum(wt[..., None] * c for wt, c in zip(weights, taps)) / total[..., None]


def panel(fill: np.ndarray, strip: np.ndarray, blend: bool) -> np.ndarray:
    sh = strip.shape[0]
    # the fill reaches down to where the strip is still solid: below that its straight edge shows through the gaps
    solid = int(np.argmax(strip[..., 3].mean(1) < 0.97))
    h = FILL + sh
    out = np.empty((h, W, 3), np.float32)
    out[:] = HAZE
    out[: FILL + solid] = hex_fill(fill, W, FILL + solid)
    reps = -(-W // (2 * strip.shape[1]))
    e = np.concatenate([strip, strip[:, ::-1]] * reps, 1)[:, :W].copy()
    if blend:
        # over the solid band the strip's leaves appear brightest first: a height blend, no cross-fade
        ramp = np.clip(np.arange(sh) / max(solid, 1), 0, 1)[:, None]
        l = luma(e[..., :3])
        l = (l - l[:solid].mean()) / (l[:solid].std() * 4 + 1e-3) + 0.5
        e[..., 3] *= np.clip((l + ramp * 1.6 - 0.8) / 0.08, 0, 1)
    a = e[..., 3:4]
    out[FILL:] = e[..., :3] * a + out[FILL:] * (1 - a)
    return out


def main(pack: Path, out: Path) -> None:
    textures = json.loads((pack / "manifest.json").read_text())["textures"]
    rows = []
    for k, tree in enumerate(TREES):
        fill, strip = textures[f"leaf-{k}"], textures[f"canopy-{tree}"]
        f = at_scale(pack / fill["file"], fill["s"])
        s = at_scale(pack / strip["file"], strip["s"])
        print(f"{tree}: fill tile {f.shape[1]} units, strip {s.shape[1]} x {s.shape[0]} units")
        gap = np.full((FILL + s.shape[0], 8, 3), 0.1, np.float32)
        rows.append(np.concatenate([panel(f, s, False), gap, panel(f, s, True)], 1))
        rows.append(np.full((8, rows[-1].shape[1], 3), 0.1, np.float32))
    img = np.concatenate(rows[:-1], 0)
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(out, quality=88)
    print(out)


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
