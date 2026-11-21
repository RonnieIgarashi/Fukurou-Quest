"""アイテムの絵（docs/concept/items.webp。2026-11-21 Ronnie）を1つずつ切り抜く。

白い紙の上の水彩なので、extract_sprites.py と同じやり方で紙を抜いて、縁を半透明にする。
大きさは元の絵のまま（どれも 100px 前後。ゲームでは縮めて描く）。文字（ラベル）は使わない。
出力：public/assets/items/<id>.png
使い方：python tools/extract_items.py（numpy・scipy・Pillow）
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

import extract_sprites
from extract_sprites import cut, foreground, save

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs/concept/items.webp'
OUT = ROOT / 'public/assets/items'

# 一覧絵の中の範囲（この中に中心がある塊を1枚にまとめる）
ITEMS = {
    'mana-water': (92, 142, 191, 225),
    'mana-fire': (290, 126, 403, 224),
    'mana-white': (484, 131, 558, 212),
    'mana-earth': (607, 130, 683, 209),
    'mana-wind': (749, 115, 858, 216),
    'wood': (65, 336, 231, 445),
    'hide': (283, 315, 432, 410),
    'hair': (484, 296, 607, 393),
    'water': (644, 229, 727, 437),
    'seed-wheat': (785, 322, 860, 397),
    'bean': (914, 321, 981, 412),
    'bread': (89, 538, 207, 636),
    'meat': (301, 488, 455, 596),
    'fish': (520, 513, 640, 586),
    'apple': (785, 467, 873, 566),
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    extract_sprites.OUT = OUT
    rgb = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
    fg = foreground(rgb.astype(np.int16))
    lab, _ = ndimage.label(ndimage.binary_dilation(fg, iterations=3))
    for name, box in ITEMS.items():
        save(cut(rgb, fg, lab, box), 1.0, name)


if __name__ == '__main__':
    main()
