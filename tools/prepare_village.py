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


# ---------------------------------------------------------------- 主人公とモクちゃんの家（大きな木の家）

TREEHOUSE = ROOT / 'docs/concept/treehouse.jpg'
# 作業は元の絵の半分の大きさで行う（村に置くときはさらに縮めるので、細かさは十分）
TH_HALF = 0.5
# 上端の見切れを補うために、上に足す余白（元の絵の px）
TH_PAD = 240
# 村に置く大きさ（元の絵の px → 村の px）と、はしごの足元を置く位置
TH_SCALE = 0.12  # 2026-11-19 Ronnie「微妙に大きい」→ 0.17 から小さく
TH_FOOT_SRC = (1205, 1700)
TH_FOOT_VILLAGE = (1015, 655)

# 木と家だけを囲む形（元の絵の px）。まわりの景色（左の森・牧場・右の荒野や鍛冶小屋）は入れない
TH_POLYS = [
    # 葉の茂り・幹・根もと
    [(940, -230), (1840, -230), (1880, 60), (1860, 200), (1800, 280), (1650, 300), (1580, 330), (1580, 600),
     (1580, 1150), (1600, 1280), (1700, 1330), (1830, 1400), (1860, 1470), (1700, 1505), (1320, 1500),
     (1320, 1720), (1080, 1720), (1080, 1500), (470, 1490), (470, 1440), (640, 1360), (760, 1260), (850, 1100),
     (880, 980), (870, 850), (860, 760), (900, 600), (860, 300), (870, 100)],
    # 右の枝と葉
    [(1530, 560), (1620, 470), (1660, 380), (1700, 330), (1790, 330), (1800, 380), (1880, 370), (2000, 410),
     (2070, 440), (2060, 520), (1980, 560), (1900, 585), (1920, 640), (1860, 660), (1780, 640), (1700, 625),
     (1600, 645), (1545, 700)],
    # 左上の枝（洗濯ひもの端）
    [(470, 490), (560, 500), (640, 560), (760, 640), (880, 690), (880, 730), (750, 700), (620, 600), (520, 540), (470, 520)],
    # 左の枝と、看板・葉
    [(200, 770), (330, 812), (400, 788), (520, 762), (640, 728), (760, 698), (880, 700), (880, 830), (800, 805),
     (720, 795), (640, 790), (560, 798), (545, 830), (545, 1050), (360, 1050), (360, 838), (300, 865), (230, 935),
     (200, 910)],
    # 洗濯ひもと服
    [(470, 500), (940, 270), (1180, 260), (1180, 450), (940, 450), (740, 560), (620, 600), (470, 530)],
]


def th_dome(w_half, pad_half, x0, x1):
    """上端の見切れの上に足す、葉の茂りの丸い形（半分の大きさの座標）。x0〜x1 は元の絵の上端の茂りの幅"""
    cx, hw, h = (x0 + x1) / 2, (x1 - x0) / 2, 215 * TH_HALF
    top = np.full(w_half, np.inf)
    for x in range(w_half):
        u = (x - cx) / hw
        if abs(u) < 1:
            # 葉のかたまりのでこぼこ（幅 30〜40px ほどのふくらみ）
            bump = 7 * abs(np.sin((x - x0) / 36 * np.pi))
            top[x] = pad_half - h * (1 - u * u) ** 0.55 - bump * (1 - u * u) ** 0.3
    return top


def build_treehouse():
    """木の家の絵を、上端を補い、景色を抜いた RGBA にする（半分の大きさ）"""
    src = Image.open(TREEHOUSE).convert('RGB')
    src = src.resize((round(src.width * TH_HALF), round(src.height * TH_HALF)), Image.LANCZOS)
    a = np.asarray(src).astype(np.float32)
    pad = round(TH_PAD * TH_HALF)
    h, w = a.shape[:2]
    img = np.full((h + pad, w, 3), 250.0, np.float32)
    img[pad:] = a
    paper = (a.min(axis=2) > 226) & ((a.max(axis=2) - a.min(axis=2)) < 24)
    # 1. 上端の見切れ：元の絵の上端の茂りを上下に裏返して少し伸ばし、丸い形に描き足す
    #    （裏返すと、つなぎ目で模様が途切れない。伸ばすのは、枝が入らない上の方だけを使うため）
    row = np.nonzero(~paper[1])[0]
    x0, x1 = row.min(), row.max()
    top = th_dome(w, pad, x0, x1)
    yy, xx = np.mgrid[0:h + pad, 0:w]
    dome = (yy >= top[None, :]) & (yy < pad)
    band = round(80 * TH_HALF)
    stretch = (215 * TH_HALF + 8) / band
    for y in range(pad):
        sy = pad + min(band - 1, int((pad - 1 - y) / stretch))
        m = dome[y]
        img[y, m] = img[sy, m]
    # 裏返した所は、少し明るく（上の葉は光が当たる）
    lift = np.clip((pad - yy) / max(1, pad), 0, 1)[..., None] * dome[..., None]
    img = img * (1 - 0.12 * lift) + 255 * 0.12 * lift
    print('  茂りを描き足した')
    # 輪郭の墨線（ゆらいだ線で、葉のかたまりの形に）
    rng = np.random.default_rng(3)
    ink = np.zeros((h + pad, w), np.float32)
    for x in range(w):
        if np.isfinite(top[x]):
            y = top[x] + rng.normal(0, 0.4)
            y0 = int(np.floor(y))
            for dy, k in ((0, 1.0), (1, 0.7), (-1, 0.35)):
                if 0 <= y0 + dy < h + pad:
                    ink[y0 + dy, x] = max(ink[y0 + dy, x], k)
    ink = ndimage.gaussian_filter(ink, 0.6)
    inkc = np.array([62, 48, 40], np.float32)
    img = img * (1 - ink[..., None] * 0.85) + inkc * ink[..., None] * 0.85
    # 2. 形：木と家の範囲の中の、紙でない所（＋描き足した茂り）
    pm = Image.new('L', (w, h + pad), 0)
    d = ImageDraw.Draw(pm)
    for poly in TH_POLYS:
        d.polygon([(x * TH_HALF, (y + TH_PAD) * TH_HALF) for x, y in poly], fill=255)
    region = np.asarray(pm) > 0
    mn = img.min(axis=2)
    sat = img.max(axis=2) - mn
    paperish = (mn > 222) & (sat < 26)
    fg = region & ~paperish
    # 枝の先の後ろは、淡く描かれた遠くの森。淡い所（明るく色の薄い所）は木ではないので抜く
    far = np.zeros_like(region)
    far[:, :round(560 * TH_HALF)] = True
    far[:round((TH_PAD + 680) * TH_HALF), round(1590 * TH_HALF):] = True
    fg &= ~(far & (mn > 150) & (sat < 80))
    fg |= dome | (ink > 0.2)
    fg = ndimage.binary_closing(fg, iterations=2) & (region | dome | (ink > 0.05))
    # 線で囲まれたすき間は埋めるが、紙の白い所（枝と洗濯ひもの間など）は抜いたまま
    fg = ndimage.binary_fill_holes(fg) & ~(paperish & ~dome)
    fg = ndimage.binary_opening(fg, iterations=1) | dome
    alpha = ndimage.gaussian_filter(fg.astype(np.float32), 0.7)
    alpha = np.where(fg, np.maximum(alpha, 0.85), alpha)
    # 3. 地面との境目：根もとの下の端を、でこぼこにして少しずつ透かす（直線で切れて浮いて見えないように）
    rng2 = np.random.default_rng(5)
    base = (1470 + TH_PAD) * TH_HALF
    noise = ndimage.gaussian_filter1d(rng2.normal(0, 1, w), 6) * 10 * TH_HALF / 0.5
    ladder = (xx >= 1075 * TH_HALF) & (xx <= 1325 * TH_HALF)
    ramp = np.clip((base + noise[None, :] + 22 * TH_HALF - yy) / (40 * TH_HALF), 0, 1)
    alpha = np.where(ladder, alpha, alpha * ramp)
    # はしごの足も、地面に少し埋める
    lbase = (1690 + TH_PAD) * TH_HALF
    alpha = np.where(ladder, alpha * np.clip((lbase - yy) / (14 * TH_HALF), 0, 1), alpha)
    # 4. 色合いを村の絵に寄せる（彩度とコントラストを少し落とし、少し温かく）
    g = img.mean(axis=2, keepdims=True)
    img = g + (img - g) * 0.85
    img = 128 + (img - 128) * 0.92
    img = img * np.array([1.02, 1.0, 0.95], np.float32)
    return np.concatenate([np.clip(img, 0, 255), alpha[..., None] * 255], axis=2)


def place_treehouse(out):
    """前の小屋を消して、木の家を置く"""
    print('木の家')
    # 前の小屋（屋根・煙突・壁）を、まわりの森と草で埋める
    # 小屋の形だけを消す（広く消すと、継ぎ当ての跡が木の家のまわりに見えてしまう）
    hole = poly_mask([
        [(968, 562), (990, 512), (1098, 512), (1112, 562)],  # 屋根
        [(974, 556), (1106, 556), (1106, 666), (974, 666)],  # 壁
        [(1000, 500), (1034, 500), (1034, 540), (1000, 540)],  # 煙突
    ])
    hole = dilate(hole, 3)
    allow = box_mask(880, 440, 1200, 720) & ~dilate(hole, 6)
    out = inpaint(out, hole, allow, p=15, lam=0.02, seed=11)
    rgba = build_treehouse()
    k = TH_SCALE / TH_HALF
    small = resize_rgba(rgba, k)
    fx = TH_FOOT_SRC[0] * TH_HALF * k
    fy = (TH_FOOT_SRC[1] + TH_PAD) * TH_HALF * k
    x0 = round(TH_FOOT_VILLAGE[0] - fx)
    y0 = round(TH_FOOT_VILLAGE[1] - fy)
    print(f'  木の家 {small.shape[1]}x{small.shape[0]} を ({x0},{y0}) に置く')
    # 足元に、やわらかい影を落としてから置く（地面とつながって見えるように）
    fxv, fyv = TH_FOOT_VILLAGE
    ry, rx = np.mgrid[0:H, 0:W]
    d = ((rx - fxv) / (0.62 * small.shape[1] * 0.5)) ** 2 + ((ry - (fyv - 9)) / 13) ** 2
    shade = np.clip(1 - d, 0, 1) ** 1.5 * 0.32
    out = out * (1 - shade[..., None]) + np.array([40, 52, 30], np.float32) * shade[..., None]
    paste_rgba(out, small, x0, y0)
    return out


# ---------------------------------------------------------------- 本体


# 畑の奥のリンゴの木の実（絵の中の位置）。ゲーム側の src/core/map.ts の APPLES と同じ
APPLES = [
    (1143, 568), (1173, 552), (1177, 586),
    (1234, 523), (1207, 540), (1240, 554), (1203, 569), (1240, 583),
    (1283, 564), (1298, 579), (1275, 588), (1305, 599),
]


def clear_apples(out):
    """木に描かれた赤い実を、まわりの葉の塗りで描き直す"""
    yy, xx = np.mgrid[0:H, 0:W]
    near = np.zeros((H, W), bool)
    for x, y in APPLES:
        near |= (xx - x) ** 2 + (yy - y) ** 2 <= 11 ** 2
    r, g, b = out[..., 0], out[..., 1], out[..., 2]
    red = (r > g + 30) & near
    dark = (lum(out) < 95) & near
    hole = dilate(red | (dark & dilate(red, 4)), 2) & near
    leaves = (g > r + 8) & (g > b) & box_mask(1100, 480, 1340, 630)
    allow = ndimage.binary_erosion(leaves, iterations=2) & ~dilate(hole, 3)
    return wash_fill(out, hole, allow, ref=leaves & ~hole, sigma=6, seed=11)


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
        pass  # 牛の絵は tools/extract_sprites.py が素材の一覧絵から作る（2026-11-17）
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
    pass  # 同上

    print('リンゴの木の実：消して、ゲームの中で Ronnie のリンゴの絵を置く（2026-11-21）')
    out = clear_apples(out)

    out = place_treehouse(out)

    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(OUT, quality=92)
    print('saved', OUT)


if __name__ == '__main__':
    main()
