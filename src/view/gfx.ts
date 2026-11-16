// 描画の下回り：小さなキャンバスの作成、ドット絵の画像化、乱数。
import { PALETTE, SpriteDef } from './sprites.js';

export type Ctx = CanvasRenderingContext2D;

/** 内部解像度（【確定】384x216 の 16:9） */
export const BASE_W = 384;
export const BASE_H = 216;

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

const cache = new Map<SpriteDef, [HTMLCanvasElement, HTMLCanvasElement]>();

/** ドット絵を画像にする（mirror で左右反転） */
export function spriteImage(def: SpriteDef, mirror = false): HTMLCanvasElement {
  let pair = cache.get(def);
  if (!pair) {
    const [c, ctx] = makeCanvas(def.w, def.h);
    def.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = PALETTE[row[x]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
    });
    const [m, mctx] = makeCanvas(def.w, def.h);
    mctx.scale(-1, 1);
    mctx.drawImage(c, -def.w, 0);
    pair = [c, m];
    cache.set(def, pair);
  }
  return pair[mirror ? 1 : 0];
}

/** 足元 (x, y) を基準に描く */
export function drawAtFeet(ctx: Ctx, def: SpriteDef, x: number, y: number, mirror = false): void {
  ctx.drawImage(spriteImage(def, mirror), Math.round(x - def.w / 2), Math.round(y - def.h));
}

/** 足元の影 */
export function drawShadow(ctx: Ctx, x: number, y: number, w: number): void {
  ctx.fillStyle = 'rgba(20, 16, 40, 0.28)';
  const rx = Math.round(x - w / 2);
  ctx.fillRect(rx + 1, Math.round(y - 1), w - 2, 2);
  ctx.fillRect(rx, Math.round(y), w, 1);
}

/** 決まった種から作る乱数（テクスチャ用） */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
