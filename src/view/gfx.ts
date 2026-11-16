// 描画の下回り：小さなキャンバスの作成、ドット絵の画像化、乱数。
import { PALETTE, SpriteDef } from './sprites.js';

export type Ctx = CanvasRenderingContext2D;

/** 画面（フィールド）の内部解像度。【確定】640x360 の 16:9。背景の絵とドット絵はこの解像度で描いて整数倍に拡大する */
export const VIEW_W = 640;
export const VIEW_H = 360;
/** メニュー・会話などの UI の座標系（384x216）。出力の大きさに合わせて拡大して描く */
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

/** 足元の影（だ円） */
export function drawShadow(ctx: Ctx, x: number, y: number, w: number): void {
  ctx.fillStyle = 'rgba(30, 24, 40, 0.3)';
  const h = Math.max(2, Math.round(w / 4));
  for (let j = 0; j < h; j++) {
    const k = (j + 0.5) / h - 0.5;
    const half = Math.round((w / 2) * Math.sqrt(1 - 4 * k * k));
    ctx.fillRect(Math.round(x - half), Math.round(y - h / 2 + j), half * 2, 1);
  }
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
