// Ronnie の素材（水彩の絵を切り抜いた PNG。tools/extract_sprites.py が作る）を読み込んで描く。
// 読み込み前・失敗したときは null を返すので、呼ぶ側はドット絵で代わりに描く。
import { Dir } from '../core/state.js';
import { Ctx } from './gfx.js';

const cache = new Map<string, HTMLImageElement>();

export function art(name: string): HTMLImageElement | null {
  let img = cache.get(name);
  if (!img) {
    img = new Image();
    img.src = `assets/sprites/${name}.png`;
    cache.set(name, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** アイテムの絵（Ronnie の素材。tools/extract_items.py が作る public/assets/items/<id>.png） */
const itemCache = new Map<string, HTMLImageElement>();

export function itemArt(id: string): HTMLImageElement | null {
  let img = itemCache.get(id);
  if (!img) {
    img = new Image();
    img.src = `assets/items/${id}.png`;
    itemCache.set(id, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** 絵を、縦横比を保って w×h の枠の真ん中に収める大きさと位置 */
export function fitBox(img: HTMLImageElement, x: number, y: number, w: number, h: number): [number, number, number, number] {
  const k = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * k;
  const dh = img.naturalHeight * k;
  return [x + (w - dw) / 2, y + (h - dh) / 2, dw, dh];
}

/** 足元（x, y）を基準に、k 倍で描く。mirror で左右反転 */
export function drawArtAtFeet(ctx: Ctx, img: HTMLImageElement, x: number, y: number, k: number, mirror = false, squashY = 1): void {
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k * squashY;
  ctx.save();
  ctx.translate(x, y);
  if (mirror) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
}

/** 絵の重心（不透明な所の平均の位置、px）。羽ばたきの絵どうしで体の位置をそろえるのに使う */
const centroids = new Map<string, { x: number; y: number }>();

export function centroidOf(name: string, img: HTMLImageElement): { x: number; y: number } {
  let c = centroids.get(name);
  if (c) return c;
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  const g = cv.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < cv.height; y++)
    for (let x = 0; x < cv.width; x++)
      if (d[(y * cv.width + x) * 4 + 3] > 128) {
        sx += x;
        sy += y;
        n++;
      }
  c = n ? { x: sx / n, y: sy / n } : { x: cv.width / 2, y: cv.height / 2 };
  centroids.set(name, c);
  return c;
}

/**
 * 重心を (x, y) に合わせて描く（飛んでいる仲間用）。
 * 羽を広げた絵と閉じた絵は大きさが違うので、足元でそろえると体が上下に跳ねて見える（2026-11-18 Ronnie 指摘）
 */
export function drawArtAtCenter(ctx: Ctx, name: string, img: HTMLImageElement, x: number, y: number, k: number, mirror = false, squashY = 1): void {
  const c = centroidOf(name, img);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k * squashY;
  ctx.save();
  ctx.translate(x, y);
  if (mirror) ctx.scale(-1, 1);
  ctx.drawImage(img, -c.x * k, -c.y * k * squashY, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------- 仲間

/** 足元から体の重心までの高さ（ワールド単位。正面の絵の値に合わせる） */
export const COMPANION_BODY = { moku: 0.28 * 82, momo: 0.27 * 82 } as const;

/** 絵の倍率（基準の正面の絵 150px を、モクちゃん約42・ももっちゅ約40 のワールド単位に） */
export const COMPANION_SCALE = { moku: 0.28, momo: 0.27 } as const;

/** 向きと羽ばたきから、使う絵と左右反転を決める（横向きの絵は右向き） */
export function companionPose(kind: 'moku' | 'momo', dir: Dir, flap: boolean): { name: string; mirror: boolean } {
  const view = dir === 'down' ? 'front' : dir === 'up' ? 'back' : 'side';
  return { name: `${kind}-${view}${flap ? '-flap' : ''}`, mirror: dir === 'left' };
}

// ---------------------------------------------------------------- 牛

/** 牛の絵の倍率（白ウシの正面 200px を約76 に＝主人公より少し大きく。黒ウシは同じ倍率で、少しだけ大きく見える） */
export const COW_SCALE = 0.38;

/**
 * 牛の向きと歩きのコマから、使う絵を決める。
 * 左右の絵は別々（left は左向き、right と walk は右向き）。左へ歩くときの walk は反転して使う
 */
export function cowPose(color: 'white' | 'black', dir: Dir, step: boolean): { name: string; mirror: boolean } {
  if (dir === 'down') return { name: `cow-${color}-front`, mirror: false };
  if (dir === 'up') return { name: `cow-${color}-back`, mirror: false };
  if (dir === 'right') return { name: `cow-${color}-${step ? 'walk' : 'right'}`, mirror: false };
  return step ? { name: `cow-${color}-walk`, mirror: true } : { name: `cow-${color}-left`, mirror: false };
}

/** 葉っぱの絵の数（leaf-0.png 〜） */
export const LEAF_COUNT = 17;
