// 描画の下回り：小さなキャンバスの作成、ドット絵の画像化、乱数。
// フィールドは出力の解像度で直接描く（座標は 800x450 の「ワールド単位」）。背景の絵はなめらかに拡大し、
// ドット絵は一度4倍に拡大してから縮めて描く（ドットの形を保ったまま、縁だけなじませる）。
import { PALETTE, SpriteDef } from './sprites.js';

export type Ctx = CanvasRenderingContext2D;

/** フィールドに映す範囲（ワールド単位＝背景の絵の px）。16:9。2026-11-16 に 640x360 から引いて俯瞰ぎみに */
export const VIEW_W = 800;
export const VIEW_H = 450;
/** キャラクターのドット絵を描く倍率（ワールド単位）。2026-11-16「気持ち大きめに」 */
export const SPRITE_SCALE = 1.25;
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

const HQ = 4;
const hqCache = new Map<SpriteDef, [HTMLCanvasElement, HTMLCanvasElement]>();

/** 4倍に拡大し、紙に描いたようなムラを薄くのせた絵 */
export function spriteHQ(def: SpriteDef, mirror = false): HTMLCanvasElement {
  let pair = hqCache.get(def);
  if (!pair) {
    const make = (m: boolean) => {
      const [c, ctx] = makeCanvas(def.w * HQ, def.h * HQ);
      ctx.drawImage(spriteImage(def, m), 0, 0, def.w * HQ, def.h * HQ);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.drawImage(paperGrain(), 0, 0);
      return c;
    };
    pair = [make(false), make(true)];
    hqCache.set(def, pair);
  }
  return pair[mirror ? 1 : 0];
}

let grain: HTMLCanvasElement | null = null;
/** 水彩紙のムラ（ゆるい明暗の斑点）。ドット絵を背景の絵になじませるために重ねる */
function paperGrain(): HTMLCanvasElement {
  if (grain) return grain;
  const [c, ctx] = makeCanvas(256, 256);
  const r = rng(99);
  for (let i = 0; i < 260; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const rad = 4 + r() * 14;
    const light = r() < 0.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, light ? 'rgba(255, 250, 235, 0.13)' : 'rgba(70, 50, 40, 0.10)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  grain = c;
  return c;
}

/** 足元 (x, y) を基準に、なめらかに拡大して描く（ワールド単位） */
export function drawAtFeet(ctx: Ctx, def: SpriteDef, x: number, y: number, mirror = false, scale = SPRITE_SCALE): void {
  const w = def.w * scale;
  const h = def.h * scale;
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(spriteHQ(def, mirror), x - w / 2, y - h, w, h);
  ctx.imageSmoothingEnabled = smooth;
}

/** 足元の影（ぼかしただ円。背景の絵の影の色に合わせた緑がかった灰色） */
export function drawShadow(ctx: Ctx, x: number, y: number, w: number): void {
  const h = w * 0.3;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, h / w);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
  g.addColorStop(0, 'rgba(40, 52, 30, 0.38)');
  g.addColorStop(0.7, 'rgba(40, 52, 30, 0.22)');
  g.addColorStop(1, 'rgba(40, 52, 30, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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
