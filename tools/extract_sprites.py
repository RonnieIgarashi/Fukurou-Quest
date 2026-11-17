"""Ronnie の素材の一覧絵（白い紙の上の水彩）から、キャラ・牛・葉っぱを1枚ずつ切り出す。

2026-11-17 Ronnie 指示「葉っぱ、ももっちゅ、モクちゃん、白ウシ、黒ウシ。必要なものを切り出して素材として差し替えて」。
ももっちゅの尻尾が丸くない絵（ハート形の尻尾）は使わない。

入力（docs/concept/）：
- sprites_moku_momo_leaves.jpg … 上段に葉っぱ18枚、中段にモクちゃん6ポーズ、下段にももっちゅ6ポーズ
- cows_white_black.jpg … 上段に白ウシ5方向、下段に黒ウシ5方向
出力：public/assets/sprites/ の PNG（背景は透明）
使い方：python tools/prepare_village.py と同じく numpy・scipy・Pillow（tools/requirements.txt）
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs/concept'
OUT = ROOT / 'public/assets/sprites'

# 一覧絵の中の位置（だいたいの範囲。この中に中心がある塊を1枚にまとめる）
POSES = ['front-flap', 'front', 'back-flap', 'back', 'side-flap', 'side']
SHEET = {
    'sprites_moku_momo_leaves.jpg': {
        # モクちゃん（横向きは右向き）
        **{f'moku-{p}': b for p, b in zip(POSES, [
            (42, 644, 559, 1117), (511, 730, 871, 1117), (822, 643, 1273, 1117),
            (1257, 709, 1556, 1116), (1586, 657, 1978, 1116), (1956, 687, 2330, 1116)])},
        # ももっちゅ（横向きは右向き）
        **{f'momo-{p}': b for p, b in zip(POSES, [
            (57, 1219, 465, 1725), (467, 1257, 809, 1720), (819, 1220, 1200, 1720),
            (1249, 1258, 1532, 1716), (1572, 1229, 1971, 1657), (1972, 1220, 2351, 1726)])},
    },
    'cows_white_black.jpg': {
        'cow-white-front': (106, 102, 423, 691),
        'cow-white-back': (558, 104, 848, 684),
        'cow-white-left': (931, 121, 1475, 681),
        'cow-white-right': (1489, 122, 1994, 681),
        'cow-white-walk': (1993, 129, 2468, 688),
        'cow-black-front': (86, 837, 534, 1436),
        'cow-black-back': (536, 824, 896, 1437),
        'cow-black-left': (922, 896, 1645, 1433),
        'cow-black-right': (1651, 846, 2030, 1434),
        'cow-black-walk': (2005, 852, 2495, 1439),
    },
}
# 縮める倍率は仲間ごとに1つ（ポーズで大きさが変わらないように）。基準の絵をこの高さ（px）にする。
# ゲームでは縮めて描くので、拡大しても粗くならないよう大きめに持つ。
# 牛は白・黒で同じ倍率（一覧絵の時点で、黒ウシが白ウシより少し大きく描いてある）
GROUPS = {
    'moku': ('moku-front', 150),
    'momo': ('momo-front', 150),
    'cow': ('cow-white-front', 200),
}
LEAF_SCALE = 0.42


def foreground(rgb, holes=False):
    """紙（白っぽく色の薄い所）のうち、外側から続く所を背景とする。白いおなかなど、線で囲まれた所は残る。

    holes：脚の間など、囲まれていても真っ白な紙の所は背景にする（牛の絵だけ。モクちゃんの白いおなかは残したい）
    """
    mn = rgb.min(axis=2)
    sat = rgb.max(axis=2) - mn
    paper = (mn > 226) & (sat < 24)
    lab, _ = ndimage.label(paper)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    if holes:
        pure = (mn > 238) & (sat < 14)
        plab, n = ndimage.label(pure & ~bg)
        sizes = ndimage.sum(np.ones_like(mn), plab, range(1, n + 1))
        big = [i + 1 for i, s in enumerate(sizes) if s > 120]
        bg |= ndimage.binary_dilation(np.isin(plab, big), iterations=2) & paper
    return ~bg


def alpha_of(rgb, fg):
    """縁は紙の白さに応じて半透明にする（水彩のにじみを残す）"""
    lum = rgb.mean(axis=2)
    inner = ndimage.binary_erosion(fg, iterations=2)
    a = np.clip((250 - lum) / 40, 0, 1)
    a = np.where(inner, 1.0, np.where(fg, np.maximum(a, 0.35), 0))
    return ndimage.gaussian_filter(a, 0.6) * (ndimage.binary_dilation(fg, iterations=1))


def unpremultiply(rgb, a, paper=250.0):
    """紙の白が混ざった縁の色を、白を引いた本来の色に戻す"""
    aa = np.maximum(a, 0.05)[..., None]
    return np.clip((rgb - (1 - aa) * paper) / aa, 0, 255)


def resize_rgba(rgba, k):
    h = max(1, round(rgba.shape[0] * k))
    w = max(1, round(rgba.shape[1] * k))
    a = rgba[..., 3] / 255
    chans = [rgba[..., c] * a for c in range(3)] + [a]
    out = [np.asarray(Image.fromarray(ch.astype(np.float32), 'F').resize((w, h), Image.LANCZOS)) for ch in chans]
    al = np.clip(out[3], 0, 1)
    al = np.where(al < 0.03, 0, al)
    rgb = np.stack([np.where(al > 0, out[c] / np.maximum(al, 0.03), 0) for c in range(3)], axis=2)
    return np.concatenate([np.clip(rgb, 0, 255), al[..., None] * 255], axis=2)


def cut(rgb, fg, lab, box):
    """範囲の中の塊を、背景を抜いた RGBA にする（元の大きさのまま）"""
    x0, y0, x1, y1 = box
    ids = []
    for i, c in enumerate(ndimage.center_of_mass(fg, lab, range(1, lab.max() + 1))):
        cy, cx = c
        if x0 <= cx <= x1 and y0 <= cy <= y1:
            ids.append(i + 1)
    m = np.isin(lab, ids) & fg
    ys, xs = np.nonzero(m)
    by0, by1, bx0, bx1 = ys.min() - 3, ys.max() + 4, xs.min() - 3, xs.max() + 4
    sub = rgb[by0:by1, bx0:bx1]
    a = alpha_of(sub, m[by0:by1, bx0:bx1])
    col = unpremultiply(sub, a)
    return np.concatenate([col, a[..., None] * 255], axis=2)


def save(rgba, k, name):
    small = resize_rgba(rgba, k)
    Image.fromarray(small.astype(np.uint8), 'RGBA').save(OUT / f'{name}.png')
    print(f'  {name}.png {small.shape[1]}x{small.shape[0]}')


def main():
    cuts = {}
    leaves = []
    for sheet, items in SHEET.items():
        print(sheet)
        rgb = np.asarray(Image.open(SRC / sheet).convert('RGB')).astype(np.float32)
        fg = foreground(rgb.astype(np.int16), holes=sheet.startswith('cows'))
        # ひげなど細い線もいっしょになるよう、少し太らせてから塊に分ける
        lab, _ = ndimage.label(ndimage.binary_dilation(fg, iterations=3))
        for name, box in items.items():
            cuts[name] = cut(rgb, fg, lab, box)
        if sheet.startswith('sprites'):
            # 葉っぱ（上段、y < 620 の小さな塊）
            for sl in ndimage.find_objects(lab):
                if sl is None:
                    continue
                y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
                if y1 < 620 and (y1 - y0) * (x1 - x0) > 4000:
                    leaves.append(cut(rgb, fg, lab, (x0, y0, x1, y1)))
    for group, (ref, h) in GROUPS.items():
        k = h / cuts[ref].shape[0]
        for name, rgba in cuts.items():
            if name.startswith(group):
                save(rgba, k, name)
    for i, rgba in enumerate(leaves):
        save(rgba, LEAF_SCALE, f'leaf-{i}')


if __name__ == '__main__':
    main()
