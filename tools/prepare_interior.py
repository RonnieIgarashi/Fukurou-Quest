"""木の家の中の絵（docs/concept/hut_interior.jpg。2026-11-19 Ronnie）をゲーム用にする。

- 1000x747 に縮める（村と同じく、絵の1px＝ゲームの1px。画面は 800x450 なので、中を歩くと少し動く）
- 部屋のまわりの白い紙は、暗い木の色にする（部屋の外が白く見えないように）
出力：public/assets/maps/hut.jpg
使い方：python tools/prepare_interior.py（numpy・scipy・Pillow）
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs/concept/hut_interior.jpg'
OUT = ROOT / 'public/assets/maps/hut.jpg'
SIZE = (1000, 747)
DARK = np.array([27, 23, 18], np.float32)


def main():
    im = Image.open(SRC).convert('RGB').resize(SIZE, Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    mn = a.min(axis=2)
    sat = a.max(axis=2) - mn
    paper = (mn > 222) & (sat < 26)
    lab, _ = ndimage.label(paper)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    outside = np.isin(lab, list(edge))
    outside = ndimage.binary_dilation(outside, iterations=1)
    # 外側ほど暗く（木のうろの奥に部屋があるように）
    k = ndimage.gaussian_filter(outside.astype(np.float32), 3)
    k = np.where(outside, 1.0, k)[..., None]
    out = a * (1 - k) + DARK * k
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(OUT, quality=92)
    print('saved', OUT)


if __name__ == '__main__':
    main()
