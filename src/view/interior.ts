// 室内の仮の絵（Ronnie が室内の絵を用意するまでの間）。水彩風に、やわらかい塗りと焦げ茶の線で描く。
// 絵のファイル（map.ts の image）が用意されたら、そちらが優先される。
import { AreaId, ROOM } from '../core/map.js';
import { Ctx, makeCanvas, rng } from './gfx.js';

const INK = 'rgba(61, 48, 41, 0.85)';
const cache = new Map<AreaId, HTMLCanvasElement>();

/** 少しゆらいだ四角（手描きらしさ） */
function wobblyRect(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, r: () => number, line = true): void {
  const j = () => (r() - 0.5) * 2;
  ctx.beginPath();
  ctx.moveTo(x + j(), y + j());
  ctx.lineTo(x + w + j(), y + j());
  ctx.lineTo(x + w + j(), y + h + j());
  ctx.lineTo(x + j(), y + h + j());
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (line) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

/** 水彩のにじみ（ゆるい斑点）を範囲に重ねる */
function wash(ctx: Ctx, x: number, y: number, w: number, h: number, r: () => number, n = 40): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let i = 0; i < n; i++) {
    const cx = x + r() * w;
    const cy = y + r() * h;
    const rad = 10 + r() * 40;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    const light = r() < 0.5;
    g.addColorStop(0, light ? 'rgba(255, 248, 230, 0.12)' : 'rgba(90, 60, 40, 0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  ctx.restore();
}

function room(ctx: Ctx, r: () => number, wall: string, floor: string): void {
  // 外は暗く
  ctx.fillStyle = '#1b1712';
  ctx.fillRect(0, 0, 800, 450);
  const { x0, y0, x1, y1 } = ROOM;
  // 奥の壁
  wobblyRect(ctx, x0 - 20, 60, x1 - x0 + 40, y0 - 60 + 6, wall, r);
  wash(ctx, x0 - 20, 60, x1 - x0 + 40, y0 - 54, r);
  // 腰板
  wobblyRect(ctx, x0 - 20, y0 - 34, x1 - x0 + 40, 40, '#a9805a', r);
  // 床（板張り）
  wobblyRect(ctx, x0 - 20, y0 + 6, x1 - x0 + 40, y1 - y0 + 20, floor, r);
  ctx.strokeStyle = 'rgba(80, 52, 32, 0.45)';
  ctx.lineWidth = 1.2;
  for (let y = y0 + 26; y < y1 + 20; y += 22) {
    ctx.beginPath();
    ctx.moveTo(x0 - 18, y + (r() - 0.5) * 2);
    ctx.lineTo(x1 + 18, y + (r() - 0.5) * 2);
    ctx.stroke();
    for (let x = x0 + r() * 60; x < x1; x += 70 + r() * 50) {
      ctx.beginPath();
      ctx.moveTo(x, y - 22);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }
  wash(ctx, x0 - 20, y0 + 6, x1 - x0 + 40, y1 - y0 + 20, r, 60);
  // 出口（下の真ん中の敷物と戸口）
  wobblyRect(ctx, 372, y1 + 10, 56, 18, '#5a3c26', r);
  wobblyRect(ctx, 360, y1 - 26, 80, 28, '#b8574a', r);
  wash(ctx, 360, y1 - 26, 80, 28, r, 6);
  // 外周の影
  const g = ctx.createRadialGradient(400, 270, 120, 400, 270, 330);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(20, 12, 6, 0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 800, 450);
}

function hut(ctx: Ctx): void {
  const r = rng(11);
  room(ctx, r, '#e9dcc0', '#c99a68');
  // 窓（奥の壁の真ん中）
  wobblyRect(ctx, 360, 92, 80, 64, '#a7c8d8', r);
  wash(ctx, 360, 92, 80, 64, r, 8);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(400, 92);
  ctx.lineTo(400, 156);
  ctx.moveTo(360, 124);
  ctx.lineTo(440, 124);
  ctx.stroke();
  // 棚
  wobblyRect(ctx, 470, 100, 80, 10, '#8a6040', r);
  wobblyRect(ctx, 478, 84, 14, 16, '#c25b4a', r);
  wobblyRect(ctx, 498, 88, 22, 12, '#7aa0b8', r);
  wobblyRect(ctx, 526, 82, 14, 18, '#d8b060', r);
  // ベッド（左上）
  wobblyRect(ctx, 226, 176, 104, 88, '#8a6040', r);
  wobblyRect(ctx, 232, 182, 92, 76, '#f2ead8', r);
  wobblyRect(ctx, 232, 210, 92, 48, '#7e9cc0', r);
  wash(ctx, 232, 210, 92, 48, r, 10);
  wobblyRect(ctx, 246, 188, 40, 18, '#fbf6ea', r);
  // 机と椅子
  wobblyRect(ctx, 436, 230, 96, 44, '#a87850', r);
  wash(ctx, 436, 230, 96, 44, r, 8);
  wobblyRect(ctx, 452, 236, 30, 22, '#efe6cf', r); // 日記帳
  wobblyRect(ctx, 500, 228, 10, 14, '#e8d080', r); // ろうそく
  wobblyRect(ctx, 470, 282, 30, 22, '#8a6040', r);
  // モクちゃんの止まり木
  wobblyRect(ctx, 556, 194, 6, 46, '#7a5434', r);
  wobblyRect(ctx, 540, 192, 38, 6, '#8a6040', r);
  // ももっちゅりんのかご
  wobblyRect(ctx, 226, 352, 50, 26, '#c8a070', r);
  wobblyRect(ctx, 232, 348, 38, 8, '#e9c9c0', r);
}

function smithy(ctx: Ctx): void {
  const r = rng(23);
  room(ctx, r, '#d8c8b0', '#a8865e');
  // 炉（石積み）
  wobblyRect(ctx, 340, 96, 120, 136, '#9a948c', r);
  wash(ctx, 340, 96, 120, 136, r, 20);
  ctx.strokeStyle = 'rgba(61, 48, 41, 0.5)';
  ctx.lineWidth = 1.2;
  for (let y = 112; y < 230; y += 18)
    for (let x = 340 + ((y / 18) % 2) * 15; x < 460; x += 30) ctx.strokeRect(x, y, 30, 18);
  wobblyRect(ctx, 370, 168, 60, 50, '#3a2a22', r); // 火口
  wobblyRect(ctx, 380, 60, 40, 40, '#8a847c', r); // 煙突
  // 金床
  wobblyRect(ctx, 490, 262, 48, 14, '#5a5f68', r);
  wobblyRect(ctx, 502, 276, 24, 20, '#4a4f58', r);
  // 薪の山
  for (let i = 0; i < 9; i++) {
    const x = 230 + (i % 3) * 22 + (Math.floor(i / 3) % 2) * 10;
    const y = 238 - Math.floor(i / 3) * 16;
    ctx.beginPath();
    ctx.ellipse(x + 10, y, 11, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#b07c4c';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x + 10, y, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(80, 50, 30, 0.6)';
    ctx.stroke();
  }
  // 道具掛け
  wobblyRect(ctx, 480, 96, 70, 8, '#8a6040', r);
  wobblyRect(ctx, 490, 104, 6, 34, '#6a6f78', r);
  wobblyRect(ctx, 512, 104, 6, 28, '#6a6f78', r);
  wobblyRect(ctx, 534, 104, 6, 38, '#6a6f78', r);
}

/** 室内の仮の絵（800x450） */
export function interiorImage(area: AreaId): HTMLCanvasElement {
  const hit = cache.get(area);
  if (hit) return hit;
  // 4倍の解像度で描いておく（拡大してもぼやけないように）
  const S = 3;
  const [c, ctx] = makeCanvas(800 * S, 450 * S);
  ctx.imageSmoothingEnabled = true;
  ctx.scale(S, S);
  if (area === 'smithy') smithy(ctx);
  else hut(ctx);
  cache.set(area, c);
  return c;
}

/** 室内の炉の火口の位置（炉が動いているときに光らせる） */
export const SMITHY_FIRE = { x: 400, y: 200 } as const;
