"""森の入り口の絵（docs/concept/forest_entrance.jpg。2026-11-20 Ronnie）をゲーム用にする。

- 上下の紙のふちと、下の角の飾りを切り落とし、幅 1000 に縮める（1000x615）
- それでも残る紙の白い所（外側からつながる所）は、森の暗い緑にする
出力：public/assets/maps/forest.jpg
使い方：python tools/prepare_forest.py（numpy・scipy・Pillow）
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs/concept/forest_entrance.jpg'
OUT = ROOT / 'public/assets/maps/forest.jpg'
# 元の絵（2400x1792）から切り出す範囲
CROP = (0, 132, 2400, 1608)
SIZE = (1000, 615)
DARK = np.array([38, 58, 44], np.float32)


def main():
    im = Image.open(SRC).convert('RGB').crop(CROP).resize(SIZE, Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    mn = a.min(axis=2)
    sat = a.max(axis=2) - mn
    paper = (mn > 225) & (sat < 22)
    lab, _ = ndimage.label(paper)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    outside = ndimage.binary_dilation(np.isin(lab, list(edge)), iterations=1)
    k = ndimage.gaussian_filter(outside.astype(np.float32), 3)
    k = np.where(outside, 1.0, k)[..., None]
    out = a * (1 - k) + DARK * k
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(OUT, quality=92)
    print('saved', OUT, int(outside.sum()), 'px of paper painted')


if __name__ == '__main__':
    main()
