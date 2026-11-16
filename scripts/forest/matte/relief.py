# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "pillow", "scipy", "onnxruntime>=1.18", "huggingface-hub"]
# ///
"""The relief of a cut-out, for shaders that merge it into the ground (pack.py makes one per tree):

  R, G  the normal's x and y (OpenGL: G up), 0.5 flat. Where G is high a surface faces up: moss settles there
  B     depth: how near the surface is (0 the farthest bit of the subject, 1 the nearest); 0 outside it

The depth comes from Depth Anything V2 Small (Yang et al. 2024, Apache-2.0), run locally: the ONNX export of
onnx-community (fp16, about 50 MB, downloaded once into the Hugging Face cache). It reads a trunk as round and roots
apart from each other; vantilator2000/pbr-playground on Replicate gave a flatter depth, its trunk edges leaning 5°.
The cut-out is put on flat grey (the library's generation background) and read at about 1000 px on its long side, in
multiples of 14 (the model's patch). The normal's large shapes are the depth's blurred slope (a trunk's round, the
roots' tops), its fine ones (bark, cracks) the picture's own luminance, high-passed.

Usage: uv run scripts/forest/matte/relief.py <in.png> <out.png>   (to look at one; pack.py imports relief())
"""

from __future__ import annotations

import sys

import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from PIL import Image
from scipy.ndimage import uniform_filter

REPO = "onnx-community/depth-anything-v2-small"
LONG = 1022  # 73 patches of 14
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)
# how steep the depth's slope makes the normal: a trunk's flank leans about 30°, its silhouette further
SLOPE = 100
# the depth is blurred this far (texels, two box passes) before its slope is read
BLUR = 4
# fine relief: luminance blurred by FINE[0] minus blurred by FINE[1] texels, its slope times FINE[2]
FINE = (1, 6, 6)

_session: ort.InferenceSession | None = None


def depth(im: Image.Image) -> np.ndarray:
    """Nearness per texel, 0 … 1 over the opaque texels (alpha ≥ 128), 0 elsewhere."""
    global _session
    im = im.convert("RGBA")
    w, h = im.size
    k = LONG / max(w, h)
    sw, sh = (max(14, round(w * k / 14) * 14), max(14, round(h * k / 14) * 14))
    grey = Image.new("RGBA", im.size, (128, 128, 128, 255))
    rgb = Image.alpha_composite(grey, im).convert("RGB").resize((sw, sh), Image.BICUBIC)
    x = ((np.asarray(rgb, np.float32) / 255 - MEAN) / STD).transpose(2, 0, 1)[None]
    if _session is None:
        # the CPU: CoreML takes 19 of the graph's 764 nodes and only adds warnings; a picture takes about 2 s
        _session = ort.InferenceSession(hf_hub_download(REPO, "onnx/model_fp16.onnx"), providers=["CPUExecutionProvider"])
    inp = _session.get_inputs()[0]
    x = x.astype(np.float16 if "float16" in inp.type else np.float32)
    d = np.asarray(_session.run(None, {inp.name: x})[0], np.float32).squeeze()
    # back at the picture's size; the model gives inverse depth: larger is nearer
    d = np.asarray(Image.fromarray(d).resize((w, h), Image.BICUBIC), np.float32)
    a = np.asarray(im)[..., 3] >= 128
    if not a.any():
        return np.zeros((h, w), np.float32)
    lo, hi = d[a].min(), d[a].max()
    return np.where(a, np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1), 0).astype(np.float32)


def _blur(a: np.ndarray, r: int) -> np.ndarray:
    """two box passes of radius r (about a gaussian), edges clamped"""
    for _ in range(2):
        a = uniform_filter(a, size=2 * r + 1, mode="nearest")
    return a


def _slopes(a: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """central differences, x right and y up, edges clamped"""
    p = np.pad(a, 1, mode="edge")
    return (p[1:-1, 2:] - p[1:-1, :-2]) / 2, (p[:-2, 1:-1] - p[2:, 1:-1]) / 2


def relief(im: Image.Image) -> np.ndarray:
    """The relief map of a cut-out (RGBA, straight alpha): H × W × 3, uint8."""
    im = im.convert("RGBA")
    px = np.asarray(im, np.float32) / 255
    alpha = px[..., 3]
    near = depth(im)
    # luminance weighted by alpha, blurred and normalised by the blurred alpha: the silhouette's edge isn't relief
    luma = alpha * (0.299 * px[..., 0] + 0.587 * px[..., 1] + 0.114 * px[..., 2])
    fine = _blur(luma, FINE[0]) / np.maximum(_blur(alpha, FINE[0]), 1e-3) - _blur(luma, FINE[1]) / np.maximum(_blur(alpha, FINE[1]), 1e-3)
    bx, by = _slopes(_blur(near, BLUR))
    fx, fy = _slopes(fine)
    # a surface whose height falls going up faces up
    nx = -bx * SLOPE - fx * FINE[2]
    ny = -by * SLOPE - fy * FINE[2]
    n = np.sqrt(nx * nx + ny * ny + 1)
    out = np.stack([nx / n * 127.5 + 127.5, ny / n * 127.5 + 127.5, near * 255], axis=-1)
    return np.clip(np.round(out), 0, 255).astype(np.uint8)


if __name__ == "__main__":
    src, dst = sys.argv[1:3]
    Image.fromarray(relief(Image.open(src)), "RGB").save(dst)
    print(dst)
