"""村の背景を、Ronnie の修正版イメージ絵（docs/concept/village_v2.jpg）からゲーム用に作る。

2026-11-16 Ronnie 指示：
- 修正版の絵を正とする（慰霊碑の移動・森の入り口・分かりやすいベンチ・水くみ場の水樽・荒野の黒ウシ・白ウシ柄の牛）
- 物のサイズ感がやや大きすぎる → 慰霊碑・森の立て札・ベンチ・水樽を小さくして描き直す
- 牛（白ウシ2頭・黒ウシ）は切り抜いて動く絵にし、背景から消す（消した所は周りの絵の模様で丁寧に描き直す）
- 小屋の煙突の煙は絵から消し、ゲームの中で粒（パーティクル）として出す

使い方：python tools/prepare_village.py
  numpy・scipy・Pillow を使う（pip install -r tools/requirements.txt）。数分かかる。
入力：docs/concept/village_v2.jpg（修正版）、docs/concept/village_v1_clean.jpg（前の版の、牛を消した背景。牧場と水樽の下地に使う）
出力：public/assets/maps/village.jpg、public/assets/sprites/cow-white-a.png / cow-white-b.png / cow-black.png
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.signal import fftconvolve

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs/concept/village_v2.jpg'
PLATE = ROOT / 'docs/concept/village_v1_clean.jpg'
OUT = ROOT / 'public/assets/maps/village.jpg'
SPR = ROOT / 'public/assets/sprites'
W, H = 2000, 1493

# 物を小さくする倍率（Ronnie「サイズ感がやや大きすぎる」）
SHRINK = 0.78


def load(path):
    im = Image.open(path).convert('RGB')
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    return np.asarray(im).astype(np.float32)


def poly_mask(polys):
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    for p in polys:
        d.polygon([tuple(v) for v in p], fill=255)
    return np.asarray(m) > 0


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def box_mask(x0, y0, x1, y1):
    m = np.zeros((H, W), bool)
    m[y0:y1, x0:x1] = True
    return m


def lum(a):
    return 0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2]


def grassy(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (g > r * 0.92) & (g > b * 1.25) & (g > 90)


def largest(mask, min_size=0, keep=1):
    lab, n = ndimage.label(mask)
    if n == 0:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    order = np.argsort(sizes)[::-1][:keep]
    out = np.zeros_like(mask)
    for i in order:
        if sizes[i] >= min_size:
            out |= lab == i + 1
    return out


def dilate(m, n):
    return ndimage.binary_dilation(m, iterations=n) if n > 0 else m


# ---------------------------------------------------------------- 修復（模様の継ぎ当て）


def inpaint(img, hole, allow, p=9, margin=70, lam=0.25, seed=1):
    """穴を、周りの絵から似た小片を選んで少しずつ埋める（Criminisi 法の簡易版）。

    allow：継ぎ当ての材料を取ってよい範囲。穴は材料にならない。
    """
    rng = np.random.default_rng(seed)
    ys, xs = np.nonzero(hole)
    y0, y1 = max(0, ys.min() - margin), min(H, ys.max() + margin + 1)
    x0, x1 = max(0, xs.min() - margin), min(W, xs.max() + margin + 1)
    I = img[y0:y1, x0:x1].copy()
    Hm = hole[y0:y1, x0:x1].copy()
    r = p // 2
    h, w = Hm.shape
    src = allow[y0:y1, x0:x1] & ~Hm
    valid = ndimage.binary_erosion(src, structure=np.ones((p, p)), border_value=0)[r:h - r, r:w - r]
    conf = (~Hm).astype(np.float32)
    I2 = I ** 2
    Y, X = np.mgrid[r:h - r, r:w - r]
    gray = lum(I)
    steps = 0
    while Hm.any():
        if steps % 25 == 0:
            gx = ndimage.sobel(gray, 1)
            gy = ndimage.sobel(gray, 0)
            grad = np.hypot(gx, gy) * (~Hm)
            gmax = ndimage.maximum_filter(grad, size=p)
            gmax = gmax / (gmax.max() + 1e-6)
        steps += 1
        front = Hm & ndimage.binary_dilation(~Hm)
        C = ndimage.uniform_filter(conf, p)
        pri = np.where(front, C * (0.15 + gmax), -1)
        # 端に寄りすぎた点は選ばない
        pri[:r, :] = pri[-r:, :] = -1
        pri[:, :r] = pri[:, -r:] = -1
        cy, cx = np.unravel_index(np.argmax(pri + rng.random(pri.shape) * 1e-4), pri.shape)
        if pri[cy, cx] < 0:
            # 残りは近くの色で埋める
            idx = ndimage.distance_transform_edt(Hm, return_distances=False, return_indices=True)
            I[Hm] = I[idx[0][Hm], idx[1][Hm]]
            break
        T = I[cy - r:cy + r + 1, cx - r:cx + r + 1]
        M = (~Hm[cy - r:cy + r + 1, cx - r:cx + r + 1]).astype(np.float32)
        ssd = np.zeros((h - p + 1, w - p + 1), np.float32)
        for c in range(3):
            ssd += fftconvolve(I2[..., c], M[::-1, ::-1], mode='valid')
            ssd -= 2 * fftconvolve(I[..., c], (M * T[..., c])[::-1, ::-1], mode='valid')
        ssd += lam * ((Y - cy) ** 2 + (X - cx) ** 2)
        ssd[~valid] = np.inf
        by, bx = np.unravel_index(np.argmin(ssd), ssd.shape)
        S = I[by:by + p, bx:bx + p]
        fill = M == 0
        T[fill] = S[fill]
        I2[cy - r:cy + r + 1, cx - r:cx + r + 1][fill] = S[fill] ** 2
        gray[cy - r:cy + r + 1, cx - r:cx + r + 1][fill] = lum(S)[fill]
        conf[cy - r:cy + r + 1, cx - r:cx + r + 1][fill] = C[cy, cx]
        Hm[cy - r:cy + r + 1, cx - r:cx + r + 1][fill] = False
    out = img.copy()
    out[y0:y1, x0:x1] = I
    print(f'  inpaint {int(hole.sum())} px in {steps} steps')
    return out


def membrane(img, hole):
    """穴の中を、縁の色からなめらかにつなぐ（ラプラス方程式を解く）"""
    from scipy.sparse import lil_matrix
    from scipy.sparse.linalg import splu

    ys, xs = np.nonzero(hole)
    idx = -np.ones(hole.shape, int)
    idx[ys, xs] = np.arange(len(ys))
    n = len(ys)
    A = lil_matrix((n, n))
    rhs = np.zeros((n, 3))
    for k, (y, x) in enumerate(zip(ys, xs)):
        A[k, k] = 4
        for qy, qx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if idx[qy, qx] >= 0:
                A[k, idx[qy, qx]] = -1
            else:
                rhs[k] += img[qy, qx]
    lu = splu(A.tocsc())
    out = img.copy()
    for c in range(3):
        out[ys, xs, c] = lu.solve(rhs[:, c])
    return out


def wash_fill(img, hole, allow, ref=None, sigma=10, seed=1):
    """水彩の平らな塗りの所を直す：色の流れはなめらかにつなぎ、紙の質感・筆のむらは周りから継ぎ当てる

    ref：色の流れを測るのに使う所（柵や線など、塗りの色でない物を除くため）
    """
    keep = ~hole if ref is None else (~hole & ref)
    # 穴の外（ref の所）だけでぼかして、塗りの色の流れを取り出す
    w = ndimage.gaussian_filter(keep.astype(np.float32), sigma)
    lowk = np.stack([ndimage.gaussian_filter(img[..., c] * keep, sigma) for c in range(3)], axis=2) / np.maximum(w, 1e-3)[..., None]
    high = img - lowk
    lowf = membrane(lowk, hole)
    highf = inpaint(high + 128, hole, allow, p=11, lam=0.02, seed=seed) - 128
    out = img.copy()
    out[hole] = (lowf + highf)[hole]
    return out


def soft_paste(dst, src, mask, feather=3):
    """mask の所だけ src を、境目をぼかして dst に重ねる"""
    a = ndimage.gaussian_filter(mask.astype(np.float32), feather)[..., None]
    a = np.where(mask[..., None], np.maximum(a, 0.5), a)
    return dst * (1 - a) + src * a


# ---------------------------------------------------------------- 切り抜き


def matte(img, plate, region, thr=30):
    """背景（plate）との違いから、物の形を取り出す（穴は埋める）"""
    d = np.abs(img - plate).max(axis=2)
    hard = (d > thr) & region
    hard = ndimage.binary_closing(hard, iterations=2)
    hard = ndimage.binary_fill_holes(hard)
    hard = ndimage.binary_opening(hard, iterations=1)
    return largest(hard, min_size=200, keep=4)


def rgba_crop(img, hard, pad=2):
    ys, xs = np.nonzero(hard)
    y0, y1 = ys.min() - pad, ys.max() + pad + 1
    x0, x1 = xs.min() - pad, xs.max() + pad + 1
    a = ndimage.gaussian_filter(hard.astype(np.float32), 0.7)
    a = np.where(hard, np.maximum(a, 0.85), a)
    # 縁の色は、背景の色が混ざらないよう内側の色にそろえる（草の緑のふちが出ないように）
    inner = ndimage.binary_erosion(hard, iterations=1)
    idx = ndimage.distance_transform_edt(~inner, return_distances=False, return_indices=True)
    img = img.copy()
    edge = ~inner
    img[edge] = img[idx[0][edge], idx[1][edge]]
    rgb = img[y0:y1, x0:x1]
    al = a[y0:y1, x0:x1, None]
    return np.concatenate([rgb, al * 255], axis=2), (x0, y0, x1, y1)


def save_sprite(rgba, name):
    Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), 'RGBA').save(SPR / name)
    print(f'  sprite {name} {rgba.shape[1]}x{rgba.shape[0]}')


def resize_rgba(rgba, k):
    """透明部分の色が混ざらないよう、アルファを掛けてから縮める"""
    h, w = rgba.shape[:2]
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    a = rgba[..., 3:] / 255
    chans = [rgba[..., c] * a[..., 0] for c in range(3)] + [a[..., 0]]
    out = [np.asarray(Image.fromarray(ch.astype(np.float32), 'F').resize((nw, nh), Image.LANCZOS)) for ch in chans]
    al = np.clip(out[3], 0, 1)
    al = np.where(al < 0.04, 0, al)  # 縮小の揺り返しで縁に色が出ないように
    rgb = np.stack([np.where(al > 0, out[c] / np.maximum(al, 0.04), 0) for c in range(3)], axis=2)
    return np.concatenate([np.clip(rgb, 0, 255), al[..., None] * 255], axis=2)


def paste_rgba(dst, rgba, x, y):
    h, w = rgba.shape[:2]
    a = rgba[..., 3:] / 255
    dst[y:y + h, x:x + w] = dst[y:y + h, x:x + w] * (1 - a) + rgba[..., :3] * a


def shrink_object(base, src, hard, k=SHRINK):
    """物（hard の形）を、足元の中心を動かさずに k 倍にして base に描く"""
    rgba, (x0, y0, x1, y1) = rgba_crop(src, hard)
    small = resize_rgba(rgba, k)
    cx = (x0 + x1) / 2
    nx = round(cx - small.shape[1] / 2)
    ny = y1 - small.shape[0]
    paste_rgba(base, small, nx, ny)
    print(f'  shrink ({x0},{y0})-({x1},{y1}) -> ({nx},{ny})-({nx + small.shape[1]},{y1})')


# ---------------------------------------------------------------- 本体


def main():
    src = load(SRC)
    plate = load(PLATE)
    out = src.copy()

    print('白ウシ（牧場）：切り抜いて、牧場の草で描き直す')
    cows = {
        'cow-white-a.png': (544, 758, 626, 812),  # 奥の1頭（左向き）
        'cow-white-b.png': (482, 813, 566, 882),  # 手前の1頭（右向き）
    }
    pen_box = box_mask(470, 745, 700, 895)
    grass = grassy(src)
    med = np.median(lum(src)[grass & pen_box])
    holes = np.zeros((H, W), bool)
    bodies = np.zeros((H, W), bool)
    for name, (x0, y0, x1, y1) in cows.items():
        region = box_mask(x0, y0, x1, y1)
        body = largest(~grass & region)
        body = ndimage.binary_fill_holes(ndimage.binary_closing(body, iterations=2)) & region
        rgba, _ = rgba_crop(src, body)
        save_sprite(rgba, name)
        # 影（草より暗い所のうち、体につながっている所）
        near = dilate(body, 16) & pen_box
        dark = near & (lum(src) < med - 12)
        lab, _ = ndimage.label(dark | dilate(body, 2))
        ids = np.unique(lab[body & (lab > 0)])
        shadow = np.isin(lab, ids) & dark
        holes |= dilate(body, 5) | dilate(shadow, 3)
        bodies |= body
    # 柵の木は直さない（牛にも草にも当たらない所）
    fence = ~grass & ~dilate(bodies, 1) & dilate(pen_box, 20)
    fence = ndimage.binary_opening(fence, iterations=1)
    holes &= ~fence
    allow = ndimage.binary_erosion(grass & pen_box, iterations=4) & ~dilate(holes, 2)
    out = wash_fill(out, holes, allow, ref=grass & ~dilate(fence, 2), seed=5)

    print('水樽：前の版の絵を下地にして、小さくして描き直す')
    region = box_mask(398, 890, 614, 1014)
    barrels = matte(src, plate, region, thr=40)
    out = soft_paste(out, plate, dilate(barrels, 4) & region | (dilate(barrels, 4) & box_mask(398, 890, 614, 1018)), feather=2)
    shrink_object(out, src, barrels)

    print('ベンチ')
    region = box_mask(984, 756, 1070, 882)
    bench = largest(ndimage.binary_fill_holes((lum(src) < 186) & region))
    hole = dilate(bench, 4)
    allow = box_mask(930, 700, 1130, 940) & ~box_mask(0, 0, 966, H) & ~box_mask(1105, 0, W, 810)
    out = inpaint(out, hole, allow)
    shrink_object(out, src, matte(src, out, dilate(bench, 2), thr=22))

    print('森の立て札')
    sign = poly_mask([rect(1382, 561, 1453, 609), rect(1396, 600, 1411, 652), rect(1425, 600, 1441, 652)])
    hole = dilate(sign, 4)
    allow = box_mask(1320, 500, 1520, 720)
    out = inpaint(out, hole, allow)
    shrink_object(out, src, matte(src, out, dilate(sign, 2), thr=22))

    print('慰霊碑')
    mem = poly_mask([[
        (1748, 700), (1752, 668), (1770, 650), (1800, 647), (1822, 661), (1832, 690), (1835, 742),
        (1846, 748), (1848, 774), (1720, 776), (1719, 750), (1744, 744),
    ]])
    hole = dilate(mem, 4)
    allow = box_mask(1640, 590, 1920, 820)
    out = inpaint(out, hole, allow)
    shrink_object(out, src, matte(src, out, dilate(mem, 2), thr=22))

    print('小屋の煙突の煙（ゲームの中で粒として出す）')
    region = box_mask(990, 396, 1125, 509)
    smoke = (lum(src) > 150) & region
    hole = dilate(largest(dilate(smoke, 2), keep=3), 7) & ~box_mask(0, 510, W, H)
    allow = box_mask(900, 340, 1200, 505)
    out = inpaint(out, hole, allow)

    print('黒ウシ（荒野）：切り抜いて、地面を描き直す')
    region = box_mask(1765, 968, 1948, 1104)
    r, b = src[..., 0], src[..., 2]
    body = largest((r - b < 32) & region)
    body = ndimage.binary_fill_holes(ndimage.binary_closing(body, iterations=2)) & region
    L = lum(src)
    ground = box_mask(1764, 900, 1990, 1200) & (r - b > 45)
    gmed = np.median(L[ground & ~dilate(body, 10)])
    near = dilate(body, 26) & box_mask(1764, 960, 1960, 1118)
    dark = near & (L < gmed - 10) & (r - b > 25)
    lab, _ = ndimage.label(dark | dilate(body, 3))
    ids = np.unique(lab[body & (lab > 0)])
    shadow = np.isin(lab, ids) & ~body
    hole = dilate(body, 5) | dilate(shadow, 3)
    # 材料は平らな土だけ（岩・丸太・草・石垣・線は使わない）
    lines = dilate(L < 120, 5)
    allow = ndimage.binary_erosion(ground & ~lines, iterations=3) & ~box_mask(1860, 915, 1955, 1000) & ~box_mask(1880, 1090, 2000, 1170)
    out = wash_fill(out, hole, allow, seed=3)
    rgba, _ = rgba_crop(src, body)
    save_sprite(rgba, 'cow-black.png')

    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(OUT, quality=92)
    print('saved', OUT)


if __name__ == '__main__':
    main()
