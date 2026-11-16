# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "pillow", "scipy", "rembg[cpu]>=2.0.60", "transparent-background>=1.3"]
# ///
"""Local matting for the forest assets, on Apple Silicon.

Why: Replicate's 851-labs/background-remover copies the source colour into the edge pixels, so a
half-transparent moss tip still carries half the grey studio background, and compositing adds the grey again:
a light halo. Because we generate every asset on a flat background we know that background, and can take it out
exactly: F = (C - (1 - a) * B) / a. B is estimated locally (seedream adds a glow behind subjects).

Usage (uv installs the dependencies into a cached env on first run; nothing global):
  uv run scripts/forest/matte/matte.py cut <in.png> <out.png> [--model vision|birefnet|inspyrenet|<cutout.png>]
  uv run scripts/forest/matte/matte.py compare <out-dir> <in.png>...
  uv run scripts/forest/matte/matte.py grade <set|target.png> <out-dir> <rgba.png>...
  uv run scripts/forest/matte/matte.py tiles <sheet.png> <out-dir> <cols> <rows>   (soil textures, made seamless)
  uv run scripts/forest/matte/matte.py cells <raw.png> <out-dir> <cols> <rows> [--growth] [--model inspyrenet|birefnet|vision]
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

HERE = Path(__file__).parent
SAMPLES = HERE.parent / "samples"


def load_rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255


# ---- masks ---------------------------------------------------------------------------------------------------

_vision_bin: Path | None = None


def mask_vision(src: Path | Image.Image) -> np.ndarray:
    """Apple Vision's foreground mask (Neural Engine). The Swift helper is compiled once."""
    global _vision_bin
    if _vision_bin is None:
        _vision_bin = Path(tempfile.gettempdir()) / "forest-vision-mask"
        swift = HERE / "vision.swift"
        if not _vision_bin.exists() or _vision_bin.stat().st_mtime < swift.stat().st_mtime:
            subprocess.run(["swiftc", "-O", str(swift), "-o", str(_vision_bin)], check=True)
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "mask.png"
        if isinstance(src, Image.Image):
            src.save(Path(d) / "in.png")
            src = Path(d) / "in.png"
        subprocess.run([str(_vision_bin), str(src), str(out)], check=True)
        return np.asarray(Image.open(out).convert("L"), dtype=np.float32) / 255


_rembg = None


def _img(src: Path | Image.Image) -> Image.Image:
    return (src if isinstance(src, Image.Image) else Image.open(src)).convert("RGB")


def mask_birefnet(src: Path | Image.Image) -> np.ndarray:
    """BiRefNet (general) as ONNX through rembg, on the CPU. onnxruntime's CoreML provider splits this model into
    dozens of partitions and compiled them for over 12 minutes without finishing, so it is not used."""
    global _rembg
    from rembg import new_session, remove

    if _rembg is None:
        _rembg = new_session("birefnet-general", providers=["CPUExecutionProvider"])
    m = remove(_img(src), session=_rembg, only_mask=True)
    return np.asarray(m.convert("L"), dtype=np.float32) / 255


_inspy = None


def mask_inspyrenet(src: Path | Image.Image) -> np.ndarray:
    """InSPyReNet (transparent-background) on the GPU through PyTorch's MPS backend."""
    global _inspy
    from transparent_background import Remover

    if _inspy is None:
        import torch

        _inspy = Remover(mode="base", device="mps" if torch.backends.mps.is_available() else "cpu")
    m = _inspy.process(_img(src), type="map")
    return np.asarray(m.convert("L"), dtype=np.float32) / 255


def mask_from_cutout(cutout: Path) -> np.ndarray:
    return np.asarray(Image.open(cutout).convert("RGBA"), dtype=np.float32)[..., 3] / 255


MASKS = {"vision": mask_vision, "birefnet": mask_birefnet, "inspyrenet": mask_inspyrenet}


def mask(src: Path, model: str) -> np.ndarray:
    return MASKS[model](src) if model in MASKS else mask_from_cutout(Path(model))


# ---- decontamination -----------------------------------------------------------------------------------------


def local_background(rgb: np.ndarray, alpha: np.ndarray, sigma: float = 24) -> np.ndarray:
    """The background colour behind every pixel: an average of the nearby clear pixels (normalised blur)."""
    clear = (alpha < 0.02).astype(np.float32)
    w = gaussian_filter(clear, sigma)
    b = np.stack([gaussian_filter(rgb[..., c] * clear, sigma) for c in range(3)], -1)
    far = np.median(rgb[clear > 0], axis=0) if clear.any() else np.array([0.78, 0.78, 0.77])
    k = np.clip(w / 0.05, 0, 1)[..., None]  # deep inside the subject, fall back to the global colour
    return np.where(w[..., None] > 1e-4, b / np.maximum(w[..., None], 1e-4), far) * k + far * (1 - k)


def decontaminate(rgb: np.ndarray, alpha: np.ndarray, choke: float = 0.04) -> np.ndarray:
    """RGBA with the background taken out of the edge colours; a faint veil below `choke` is dropped."""
    bg = local_background(rgb, alpha)
    a = alpha[..., None]
    fg = np.clip((rgb - (1 - a) * bg) / np.maximum(a, 0.04), 0, 1)
    fg = np.where(a > 0.985, rgb, fg)
    out_a = np.clip((alpha - choke) / (1 - choke), 0, 1)
    return np.concatenate([fg, out_a[..., None]], -1)


def raw_cutout(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """What a plain remover gives: the source colour with an alpha (for comparison)."""
    return np.concatenate([rgb, alpha[..., None]], -1)


def save_rgba(arr: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(path)


def cut(src: Path, out: Path, model: str = "vision") -> float:
    t = time.time()
    a = mask(src, model)
    save_rgba(decontaminate(load_rgb(src), a), out)
    return time.time() - t


# ---- colour grading ------------------------------------------------------------------------------------------
# Assets from different models (and different calls) disagree on white balance, saturation and contrast.
# A Reinhard-style transfer in Lab moves each asset's mean and spread toward one target palette; only opaque
# pixels count, so the transparent margin doesn't skew it. Strength < 1 keeps each asset's own character.


def _lin(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _srgb(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.clip(c, 0, None) ** (1 / 2.4) - 0.055)


_M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]], np.float32)
_WHITE = np.array([0.95047, 1.0, 1.08883], np.float32)


def to_lab(rgb: np.ndarray) -> np.ndarray:
    xyz = _lin(rgb) @ _M.T / _WHITE
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def from_lab(lab: np.ndarray) -> np.ndarray:
    fy = (lab[..., 0] + 16) / 116
    f = np.stack([fy + lab[..., 1] / 500, fy, fy - lab[..., 2] / 200], -1)
    xyz = np.where(f**3 > 0.008856, f**3, (f - 16 / 116) / 7.787) * _WHITE
    return np.clip(_srgb(xyz @ np.linalg.inv(_M).T), 0, 1)


def lab_stats(rgba: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    lab = to_lab(rgba[..., :3])
    solid = rgba[..., 3] > 0.5 if rgba.shape[-1] == 4 else np.ones(lab.shape[:2], bool)
    px = lab[solid]
    return px.mean(0), px.std(0) + 1e-3


def grade(rgba: np.ndarray, target: tuple[np.ndarray, np.ndarray], strength: float = 0.7) -> np.ndarray:
    """Moves the asset's Lab mean/spread toward the target. Lightness keeps more of its own contrast."""
    mu, sd = lab_stats(rgba)
    tmu, tsd = target
    lab = to_lab(rgba[..., :3])
    s = np.array([strength * 0.6, strength, strength], np.float32)  # L, a, b
    scale = 1 + s * (tsd / sd - 1)
    shift = mu + s * (tmu - mu)
    graded = from_lab((lab - mu) * scale + shift)
    return np.concatenate([graded, rgba[..., 3:4]], -1)


def grade_files(target: str, out_dir: Path, files: list[Path], strength: float = 0.5, neutral: float = 0.7) -> None:
    """target "set": the set's own mean palette, so outliers move toward the group and nothing turns one colour.
    The cast the whole set shares (every asset was lit "warm amber") is mostly taken out (`neutral`): the scene's
    colour comes from the shader at runtime (green, purple, blue atmospheres), so assets should be neutral-lit.
    Otherwise a picture whose palette everything moves toward."""
    imgs = [np.asarray(Image.open(f).convert("RGBA"), dtype=np.float32) / 255 for f in files]
    cast = np.zeros(3, np.float32)
    if target == "set":
        all_stats = [lab_stats(i) for i in imgs]
        stats = (np.mean([m for m, _ in all_stats], 0), np.mean([s for _, s in all_stats], 0))
        # The light's cast, read where things should be grey: low-chroma pixels (bark, lichen, stone) of every asset.
        # The same amount comes off every asset, so their differences stay (cream stays cream, moss stays green).
        greys = []
        for i in imgs:
            lab = to_lab(i[..., :3])[i[..., 3] > 0.5]
            greys.append(lab[np.hypot(lab[:, 1], lab[:, 2]) < 22])
        g = np.concatenate(greys)
        cast[1:] = np.median(g[:, 1:], 0) * neutral
        print(f"cast removed (Lab a, b): {cast[1]:.1f}, {cast[2]:.1f}")
    else:
        stats = lab_stats(np.asarray(Image.open(target).convert("RGBA"), dtype=np.float32) / 255)
    tiles = []
    # Cells of different sheets share names (cell-00.png): prefix with the folder then.
    names = [f.name for f in files]
    clash = len(set(names)) < len(names)
    for f, rgba in zip(files, imgs):
        g = grade(rgba, stats, strength)
        g[..., :3] = from_lab(to_lab(g[..., :3]) - cast)
        save_rgba(g, out_dir / (f"{f.parent.name}-{f.name}" if clash else f.name))
        tiles.append((f.stem, rgba, g))
    if len(tiles) > 16:
        return  # a before/after strip of that many is unreadable; contact sheets of the graded folder serve better
    # before (top) / after (bottom), over the haze colour
    S = 256
    sheet = Image.new("RGB", (len(tiles) * (S + 8) + 8, 2 * (S + 8) + 40), (22, 19, 15))
    d = ImageDraw.Draw(sheet)
    for i, (name, a, b) in enumerate(tiles):
        for j, v in enumerate((a, b)):
            img = Image.fromarray((over(v, HAZE) * 255).astype(np.uint8))
            img.thumbnail((S, S))
            sheet.paste(img, (8 + i * (S + 8), 30 + j * (S + 8)))
        d.text((8 + i * (S + 8), 8), name[:34], fill=(216, 205, 184))
    sheet.save(out_dir / "grade.png")
    print(out_dir / "grade.png")


# ---- sprite sheet cells ------------------------------------------------------------------------------------------
# nano-banana-2 draws what it was told not to: thin grid lines between cells, a moss strip under every growth frame,
# name labels, another grid than asked (4 x 4 for 4 x 3). After the cut-out the lines and strips join neighbouring
# cells, so slicing at empty gutters fails. Here the grid comes from the raw sheet: its drawn lines, else white
# gutters, else equal parts of the asked grid.

from scipy.ndimage import label as _label


def grid_lines(rgb: np.ndarray, axis: int) -> list[int]:
    """Positions of thin straight lines across the sheet (axis 0: vertical lines, x positions)."""
    a = rgb if axis == 0 else rgb.transpose(1, 0, 2)
    bg = np.median(np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3)]), 0)
    off = np.abs(a - bg).max(-1) > 0.06
    # thin: different from the background here, and like it a few pixels to either side
    side = np.zeros_like(off)
    side[:, 4:-4] = ~off[:, :-8] & ~off[:, 8:]
    score = (off & side).mean(0)
    xs = [x for x in range(4, a.shape[1] - 4) if score[x] > 0.35]
    merged: list[int] = []
    for x in xs:
        if merged and x - merged[-1][-1] <= 6:
            merged[-1].append(x)
        else:
            merged.append([x])
    return [int(np.mean(m)) for m in merged if a.shape[1] * 0.05 < np.mean(m) < a.shape[1] * 0.95]


def grid_bands(rgb: np.ndarray, axis: int, n: int) -> list[tuple[int, int]]:
    size = rgb.shape[1 - axis]
    lines = grid_lines(rgb, axis)
    # Lines giving at least the asked cells are trusted (the model drew more than asked); fewer means some
    # were missed (white gutters, faint lines), so the other ways decide.
    if lines and len(lines) + 1 >= n:
        edges = [0] + lines + [size]
        return [(edges[i], edges[i + 1]) for i in range(len(edges) - 1)]
    bright = rgb.mean(-1) > 0.9
    frac = bright.mean(axis)
    r = _runs(frac < 0.6, size // (n * 3))
    if len(r) == n:
        return r
    if n == 1:
        return [(0, size)]
    # No lines, no gutters (subjects in a row whose roots touch): cut at the emptiest place near each equal
    # division, judged on the upper three quarters, where trunks stand apart.
    bg = np.median(np.concatenate([rgb[:8].reshape(-1, 3), rgb[:, :8].reshape(-1, 3)]), 0)
    full = np.abs(rgb - bg).max(-1) > 0.06
    upper = full[: int(full.shape[0] * 0.75)] if axis == 0 else full[:, : int(full.shape[1] * 0.75)]
    content = upper.mean(axis)
    cuts = [0]
    for k in range(1, n):
        lo, hi = int(size * (k / n - 0.1)), int(size * (k / n + 0.1))
        cuts.append(lo + int(np.argmin(content[lo:hi])))
    cuts.append(size)
    return [(cuts[i], cuts[i + 1]) for i in range(n)]


def repair_lines(rgb: np.ndarray) -> np.ndarray:
    """Paints out straight lines drawn across the sheet, also where they cross a subject (a black 2 x 2 grid line
    through a trunk). A line row is one colour across nearly the whole width, over the subject too, and that
    colour differs from the rows 12 px above and below (plain background rows are uniform as well, but match
    their surroundings). Each band, widened by 3 px for its soft edge, is replaced by a blend of the rows just
    outside it."""
    out = rgb.copy()
    for axis in (0, 1):
        a = out if axis == 0 else out.transpose(1, 0, 2)  # axis 0: horizontal lines (rows)
        n = a.shape[0]
        med = np.median(a, 1)  # per row
        uniform = (np.abs(a - med[:, None]).max(-1) < 0.08).mean(1) > 0.9
        off = np.zeros(n, bool)
        off[12:-12] = (np.abs(med[12:-12] - med[:-24]).max(-1) > 0.1) & (np.abs(med[12:-12] - med[24:]).max(-1) > 0.1)
        for y0, y1 in _runs(uniform & off, 1):
            y0, y1 = y0 - 3, y1 + 3
            if y1 - y0 > 32 or y0 < 6 or y1 > n - 6:
                continue
            # Mirror the rows above down into the band and the rows below up into it, cross-fading in the middle:
            # bark and moss keep their texture instead of smearing.
            m = y1 - y0
            if y0 - m < 0 or y1 + m > n:
                continue
            above = a[y0 - m : y0][::-1].copy()
            below = a[y1 : y1 + m][::-1].copy()
            t = np.linspace(0, 1, m)[:, None, None]
            t = t * t * (3 - 2 * t)
            a[y0:y1] = above * (1 - t) + below * t
        if axis == 1:
            out = a.transpose(1, 0, 2)
    return out


def measure(a: np.ndarray) -> dict:
    """What the packer checks a cell by (ASSETS.md, Checks), measured before the crop loses the cell's sides:
    edges: the share of each side the subject touches (a subject crossing the grid touches it);
    area: opaque pixels (fragments are small against the sheet's median);
    base: how wide the bottom 4 % of the subject is against its widest row (a tuft or clump drawn under it is wide)."""
    solid = a > 0.5
    edges = {"top": solid[0].mean(), "bottom": solid[-1].mean(), "left": solid[:, 0].mean(), "right": solid[:, -1].mean()}
    rows = np.nonzero(solid.any(1))[0]
    if not len(rows):
        return {"edges": {k: 0.0 for k in edges}, "area": 0, "base": 0.0}

    def span(r: np.ndarray) -> int:
        xs = np.nonzero(r)[0]
        return int(xs[-1] - xs[0] + 1) if len(xs) else 0

    spans = np.array([span(solid[y]) for y in range(rows[0], rows[-1] + 1)])
    n = max(2, len(spans) // 25)
    return {
        "edges": {k: round(float(v), 3) for k, v in edges.items()},
        "area": int(solid.sum()),
        "base": round(float(spans[-n:].max() / max(1, spans.max())), 3),
    }


def cells(raw: Path, out_dir: Path, cols: int, rows: int, growth: bool, model: str = "inspyrenet", per_row: bool = False) -> None:
    """Cells of a sprite sheet, each matted on its own: a salient-object model given the whole sheet decides which
    subjects matter (it dropped two beeches and turned a dark spruce into a ghost); given one cell it keeps the one."""
    rgb = load_rgb(raw)
    xs, ys = grid_bands(rgb, 0, cols), grid_bands(rgb, 1, rows)
    rgb = repair_lines(rgb)
    found = []
    for k, (y0, y1, x0, x1) in enumerate((y0, y1, x0, x1) for y0, y1 in ys for x0, x1 in xs):
        crop = rgb[y0 + 6 : y1 - 6, x0 + 6 : x1 - 6]  # inset: drops the drawn line itself
        img = Image.fromarray((crop * 255 + 0.5).astype(np.uint8))
        a = MASKS[model](img) if model in MASKS else mask_from_cutout(Path(model))
        c = decontaminate(crop, a)
        a = c[..., 3]
        lab, n = _label(a > 0.1)
        if n == 0:
            continue
        sizes = np.bincount(lab.ravel())[1:]
        keep = np.isin(lab, 1 + np.nonzero(sizes >= sizes.max() * 0.08)[0])  # specks and label letters go
        a *= gaussian_filter(keep.astype(np.float32), 1.0) > 0.5
        h, w = a.shape
        # Growth sheets: the model draws a ground strip across each frame's foot. It stays in the pixels; only
        # where it starts is measured ("foot"), and the sprite shader fades the strip's sides at runtime.
        cover = (a > 0.5).mean(1)
        band = np.nonzero(cover[int(h * 0.5) :] > 0.8)[0] if growth else []
        foot_row = int(h * 0.5) + int(band[0]) if len(band) else None
        c[..., 3] = a
        if (a > 0.1).sum() < (30 if growth else 150):  # first growth frames are tiny pins
            continue
        found.append((c, foot_row, k, measure(a)))
    if not found:
        print(f"{raw.name}: no cells")
        return
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("cell-*.png"):
        old.unlink()
    meta = []
    if growth:
        # one cell size for the whole sequence, subject on its bottom centre: frames don't jump. With per_row, each
        # row is its own sequence (a standing stub and a lying branch) and gets its own cell size.
        boxes = [np.argwhere(f[..., 3] > 0.05) for f, *_ in found]
        seq = [k // len(xs) if per_row else 0 for _, _, k, _ in found]
        size = {}
        for q in set(seq):
            bs = [b for b, s in zip(boxes, seq) if s == q]
            size[q] = (int(max(b[:, 1].max() - b[:, 1].min() for b in bs) + 9), int(max(b[:, 0].max() - b[:, 0].min() for b in bs) + 9))
        for (f, foot_row, i, checks), b, q in zip(found, boxes, seq):
            W, H = size[q]
            (by0, bx0), (by1, bx1) = b.min(0), b.max(0) + 1
            cell = np.zeros((H, W, 4), np.float32)
            dx = (W - (bx1 - bx0)) // 2
            dy = H - 4 - (by1 - by0)
            cell[dy : H - 4, dx : dx + bx1 - bx0] = f[by0:by1, bx0:bx1]
            save_rgba(cell, out_dir / f"cell-{i:02d}.png")
            # foot: where the ground strip starts, as a fraction of the cell's height (None: no strip)
            foot = round((foot_row - by0 + dy) / H, 4) if foot_row is not None else None
            meta.append({"file": f"cell-{i:02d}.png", "index": i, "w": W, "h": H, "anchor": [W / 2, H - 4], "foot": foot, **checks})
    else:
        for f, _, i, checks in found:
            b = np.argwhere(f[..., 3] > 0.05)
            (by0, bx0), (by1, bx1) = b.min(0), b.max(0) + 1
            crop = f[max(by0 - 2, 0) : by1 + 2, max(bx0 - 2, 0) : bx1 + 2]
            save_rgba(crop, out_dir / f"cell-{i:02d}.png")
            meta.append(
                {"file": f"cell-{i:02d}.png", "index": i, "w": int(crop.shape[1]), "h": int(crop.shape[0]), "anchor": [crop.shape[1] / 2, crop.shape[0] - 2], **checks}
            )
    import json

    (out_dir / "cells.json").write_text(json.dumps({"grid": [len(xs), len(ys)], "growth": growth, "cells": meta}, indent=1))
    print(f"{raw.stem}: {len(found)} cells ({len(xs)} x {len(ys)} grid)")


# ---- ground strips --------------------------------------------------------------------------------------------


def ribbon(src: Path, out: Path) -> None:
    """A ground strip cut by its colour: the salient-object models see a strip that fills the frame edge to edge down
    to the bottom as background (InSPyReNet and BiRefNet gave an empty mask). The background is flat grey and only
    above the strip, so alpha is the distance from that grey (read in the top rows), kept where it connects to the
    bottom edge, and the grey is taken out of the edges as for every cut-out."""
    rgb = load_rgb(src)
    h = rgb.shape[0]
    bg = np.median(rgb[: max(4, h // 20)].reshape(-1, 3), 0)
    d = np.abs(rgb - bg).max(-1)
    a = np.clip((d - 0.04) / 0.08, 0, 1)
    a = a * a * (3 - 2 * a)
    lab, n = _label(a > 0.5)
    bottom = set(np.unique(lab[-3:])) - {0}
    keep = np.isin(lab, list(bottom))
    a *= gaussian_filter(keep.astype(np.float32), 1.5) > 0.2
    # Light spots inside the strip (a pale leaf vein) are near the grey too: what clear area doesn't reach the sky is a hole.
    clear, _ = _label(a < 0.5)
    sky = set(np.unique(clear[:3])) - {0}
    a[(clear > 0) & ~np.isin(clear, list(sky))] = 1
    save_rgba(decontaminate(rgb, a), out)
    print(f"{out}: {(a > 0.5).mean():.0%} opaque")


# ---- soil textures ---------------------------------------------------------------------------------------------


def _runs(full: np.ndarray, min_len: int) -> list[tuple[int, int]]:
    out, start = [], None
    for i, v in enumerate(list(full) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= min_len:
                out.append((start, i))
            start = None
    return out


def split_grid(rgb: np.ndarray, cols: int, rows: int) -> list[np.ndarray]:
    """Cells of a texture sheet: between the white gutter lines when the model drew them, else equal parts.
    A 3 % inset drops the gutter's soft edge."""
    h, w = rgb.shape[:2]
    bright = rgb.mean(-1) > 0.9

    def bands(frac: np.ndarray, n: int, size: int) -> list[tuple[int, int]]:
        r = _runs(frac < 0.6, size // (n * 3))
        return r if len(r) == n else [(size * i // n, size * (i + 1) // n) for i in range(n)]

    xs = bands(bright.mean(0), cols, w)
    ys = bands(bright.mean(1), rows, h)
    out = []
    for y0, y1 in ys:
        for x0, x1 in xs:
            iy, ix = int((y1 - y0) * 0.03), int((x1 - x0) * 0.03)
            out.append(rgb[y0 + iy : y1 - iy, x0 + ix : x1 - ix])
    return out


def seamless(t: np.ndarray) -> np.ndarray:
    """Tileable: towards the edges the picture fades into a copy rolled by half, whose edges are the tile's own
    interior, so opposite edges continue each other. The middle stays the original."""
    h, w = t.shape[:2]
    r = np.roll(t, (h // 2, w // 2), (0, 1))
    y = np.minimum(np.arange(h), h - 1 - np.arange(h))[:, None] / (h * 0.25)
    x = np.minimum(np.arange(w), w - 1 - np.arange(w))[None, :] / (w * 0.25)
    m = np.clip(np.minimum(x, y), 0, 1)
    m = (m * m * (3 - 2 * m))[..., None]
    return t * m + r * (1 - m)


def tiles(sheet: Path, out_dir: Path, cols: int, rows: int) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for i, t in enumerate(split_grid(load_rgb(sheet), cols, rows)):
        s = seamless(t)
        Image.fromarray((s * 255 + 0.5).astype(np.uint8)).save(out_dir / f"tile-{i:02d}.png")
        # 2 x 2 repeat at half size, to look for seams
        rep = np.tile(s, (2, 2, 1))
        img = Image.fromarray((rep * 255 + 0.5).astype(np.uint8))
        img.resize((img.width // 2, img.height // 2), Image.LANCZOS).save(out_dir / f"tiled-{i:02d}.png")
    print(out_dir)


# ---- comparison panels ---------------------------------------------------------------------------------------

SOIL = (40, 28, 18)
HAZE = (214, 172, 112)


def over(rgba: np.ndarray, colour: tuple[int, int, int]) -> np.ndarray:
    a = rgba[..., 3:4]
    return rgba[..., :3] * a + np.array(colour, np.float32) / 255 * (1 - a)


def edge_window(alpha: np.ndarray, size: int) -> tuple[int, int]:
    """A window on the subject's top edge, where moss tips and caps are."""
    ys, xs = np.nonzero(alpha > 0.5)
    i = np.argmin(ys)
    y, x = ys[i], xs[i]
    h, w = alpha.shape
    return int(np.clip(y - size // 4, 0, h - size)), int(np.clip(x - size // 2, 0, w - size))


def compare(out_dir: Path, sources: list[Path]) -> None:
    """Per source: replicate's cut-out as is, the same alpha decontaminated, and each local model decontaminated;
    each over dark soil and warm haze, zoomed into an edge."""
    methods: list[tuple[str, callable]] = []
    rows = []
    timings: dict[str, list[float]] = {}
    for src in sources:
        rgb = load_rgb(src)
        rep = SAMPLES / "3-cutout" / src.name
        cells = []
        variants = []
        if rep.exists():
            a = mask_from_cutout(rep)
            variants += [("replicate 851 (raw)", raw_cutout(rgb, a)), ("851 + decontaminate", decontaminate(rgb, a))]
        for name in ("vision", "birefnet", "inspyrenet"):
            t = time.time()
            try:
                a = MASKS[name](src)
            except Exception as e:  # a model that won't install or run is reported, not fatal
                print(f"{name} failed on {src.name}: {e}", file=sys.stderr)
                continue
            timings.setdefault(name, []).append(time.time() - t)
            variants.append((f"{name} + decontaminate", decontaminate(rgb, a)))
            save_rgba(decontaminate(rgb, a), out_dir / name / src.name)
        base_alpha = variants[0][1][..., 3]
        y, x = edge_window(base_alpha, 192)
        for label, v in variants:
            crop = v[y : y + 192, x : x + 192]
            pair = np.concatenate([over(crop, SOIL), over(crop, HAZE)], 1)
            img = Image.fromarray((pair * 255).astype(np.uint8)).resize((768, 384), Image.LANCZOS)
            cells.append((label, img))
        rows.append((src.stem, cells))
        methods = [label for label, _ in cells] if len(cells) > len(methods) else methods
    cols = max(len(c) for _, c in rows)
    W, H, pad, top = 768, 384, 12, 28
    sheet = Image.new("RGB", (cols * (W + pad) + pad, len(rows) * (H + top + pad) + pad), (22, 19, 15))
    d = ImageDraw.Draw(sheet)
    for r, (name, cells) in enumerate(rows):
        for c, (label, img) in enumerate(cells):
            x0, y0 = pad + c * (W + pad), pad + r * (H + top + pad)
            d.text((x0, y0 + 6), f"{name} · {label}", fill=(216, 205, 184))
            sheet.paste(img, (x0, y0 + top))
    out_dir.mkdir(parents=True, exist_ok=True)
    sheet.save(out_dir / "compare.png")
    for k, v in timings.items():
        print(f"{k}: first {v[0]:.1f} s, then {np.mean(v[1:]) if len(v) > 1 else float('nan'):.2f} s per image")
    print(out_dir / "compare.png")


if __name__ == "__main__":
    cmd, *rest = sys.argv[1:] or ["help"]
    if cmd == "cut":
        model = rest[rest.index("--model") + 1] if "--model" in rest else "vision"
        print(f"{cut(Path(rest[0]), Path(rest[1]), model):.1f} s")
    elif cmd == "compare":
        compare(Path(rest[0]), [Path(p) for p in rest[1:]])
    elif cmd == "cells":
        model = rest[rest.index("--model") + 1] if "--model" in rest else "inspyrenet"
        cells(Path(rest[0]), Path(rest[1]), int(rest[2]), int(rest[3]), "--growth" in rest, model, "--rows" in rest)
    elif cmd == "ribbon":
        ribbon(Path(rest[0]), Path(rest[1]))
    elif cmd == "tiles":
        tiles(Path(rest[0]), Path(rest[1]), int(rest[2]), int(rest[3]))
    elif cmd == "grade":
        grade_files(rest[0], Path(rest[1]), [Path(p) for p in rest[2:]])
    else:
        print(__doc__)
