"""村の背景を、イメージ絵（docs/concept/village.jpg）からゲーム用に作る。

- 荒野のサボテンを消す（Ronnie 指示 2026-11-16）
- 牧場のウシ2頭を切り抜いて動く絵（public/assets/sprites/cow1.png, cow2.png）にし、背景からは消す
出力：public/assets/maps/village.jpg
使い方：python tools/prepare_village.py（Pillow のみ使用）
"""
from pathlib import Path
from PIL import Image
import random

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs/concept/village.jpg'
OUT = ROOT / 'public/assets/maps/village.jpg'
SPR = ROOT / 'public/assets/sprites'


def lum(p):
    r, g, b = p
    return 0.3 * r + 0.59 * g + 0.11 * b


def grassy(p):
    r, g, b = p
    return g > r * 0.92 and g > b * 1.25 and g > 90


def dilate(mask, n):
    for _ in range(n):
        add = set()
        for (x, y) in mask:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    add.add((x + dx, y + dy))
        mask = mask | add
    return mask


def largest(mask):
    """つながった最大の塊だけ残す"""
    left = set(mask)
    best = set()
    while left:
        seed = left.pop()
        comp = {seed}
        stack = [seed]
        while stack:
            x, y = stack.pop()
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if n in left:
                    left.remove(n)
                    comp.add(n)
                    stack.append(n)
        if len(comp) > len(best):
            best = comp
    return best


def fill(px, mask, w, h, noise=6):
    """周りの色を内側へ少しずつ広げて埋める（簡易の修復）"""
    todo = set(mask)
    rnd = random.Random(7)
    while todo:
        done = {}
        for (x, y) in todo:
            acc = [0, 0, 0]
            n = 0
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    q = (x + dx, y + dy)
                    if q in todo or not (0 <= q[0] < w and 0 <= q[1] < h):
                        continue
                    c = px[q]
                    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
                    n += 1
            if n >= 3:
                j = rnd.randint(-noise, noise)
                done[(x, y)] = tuple(max(0, min(255, int(a / n) + j)) for a in acc)
        if not done:  # 取り残しは2近傍でも埋める
            for (x, y) in list(todo)[:1]:
                done[(x, y)] = px[(x - 1, y)] if x > 0 else px[(x + 1, y)]
        for q, c in done.items():
            px[q] = c
            todo.discard(q)


def soften(px, mask, rounds=4):
    """埋めた所をならして、筋を消す（水彩の平らな塗りに近づける）"""
    for _ in range(rounds):
        new = {}
        for (x, y) in mask:
            acc = [0, 0, 0]
            for dx in (-2, -1, 0, 1, 2):
                for dy in (-2, -1, 0, 1, 2):
                    c = px[x + dx, y + dy]
                    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
            new[(x, y)] = tuple(int(a / 25) for a in acc)
        for q, c in new.items():
            px[q] = c


def main():
    im = Image.open(SRC).convert('RGB')
    w, h = im.size
    px = im.load()

    # ---- ウシ（切り抜き → 背景から消す）
    cows = [('cow1', (478, 814, 566, 882), (522, 884, 46, 9)), ('cow2', (542, 758, 630, 818), (588, 816, 42, 9))]
    for name, (x0, y0, x1, y1), (sx, sy, rx, ry) in cows:
        body = {(x, y) for x in range(x0, x1) for y in range(y0, y1) if not grassy(px[x, y])}
        body = largest(body)
        # 輪郭の内側の穴（白い模様など）も体に含める
        xs = [p[0] for p in body]
        ys = [p[1] for p in body]
        filled = set(body)
        for y in range(min(ys), max(ys) + 1):
            row = sorted(x for (x, yy) in body if yy == y)
            if len(row) >= 2:
                for x in range(row[0], row[-1] + 1):
                    if not grassy(px[x, y]) or lum(px[x, y]) > 190:
                        filled.add((x, y))
        body = filled
        bx0, by0, bx1, by1 = min(xs) - 1, min(ys) - 1, max(xs) + 2, max(ys) + 2
        spr = Image.new('RGBA', (bx1 - bx0, by1 - by0), (0, 0, 0, 0))
        sp = spr.load()
        edge = dilate(body, 1) - body
        for (x, y) in body:
            sp[x - bx0, y - by0] = px[x, y] + (255,)
        for (x, y) in edge:
            if bx0 <= x < bx1 and by0 <= y < by1:
                sp[x - bx0, y - by0] = px[x, y] + (110,)
        spr.save(SPR / f'{name}.png')
        print(name, 'sprite', spr.size, 'feet at', (sx - bx0, by1 - by0))
        # 影（体のまわりの、草より暗い所）も一緒に消す
        shadow = {(x, y) for x in range(x0 - 6, x1 + 6) for y in range(y0, y1 + 14)
                  if grassy(px[x, y]) and lum(px[x, y]) < 178}
        mask = dilate(body, 3) | dilate(shadow, 2)
        mask = {(x, y) for (x, y) in mask if x >= 474 and y <= 884}  # 左と手前の柵には手を付けない
        fill(px, mask, w, h, noise=0)
        soften(px, mask)

    # ---- サボテン
    x0, y0, x1, y1 = 1864, 960, 1936, 1086
    cactus = set()
    for x in range(x0, x1):
        for y in range(y0, y1):
            r, g, b = px[x, y]
            if g > r * 0.85 or lum((r, g, b)) < 120:
                cactus.add((x, y))
    cactus = dilate(largest(dilate(cactus, 2)), 2)
    fill(px, cactus, w, h, noise=0)
    soften(px, dilate(cactus, 2), rounds=6)

    im.save(OUT, quality=92)
    print('saved', OUT)


if __name__ == '__main__':
    main()
