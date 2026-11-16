// フィールドの描画：背景の一枚絵 → 畑 → 物と人物（足元の y で前後を決める。絵の建物や木は OCCLUDERS で手前に重ねる）
// → 時刻の光 → 周辺減光。座標は村の絵の px（1:1）、画面は 640x360。
import { hourFloat } from '../core/clock.js';
import { OCCLUDERS, PLOTS, Poly, WINDOWS, WORLD_H, WORLD_W } from '../core/map.js';
import { CROPS, CropId } from '../core/params.js';
import { mokuAsleep, momoAsleep } from '../core/sim.js';
import { Companion, GameState, Plot } from '../core/state.js';
import { Ctx, drawAtFeet, drawShadow, makeCanvas, rng, spriteImage, VIEW_H, VIEW_W } from './gfx.js';
import { MOKU, MOMO, PLAYER, ZZZ } from './sprites.js';

export interface Camera {
  x: number;
  y: number;
}

/** 表示だけに使う、主人公の歩きの状態 */
export interface PlayerAnim {
  moving: boolean;
  /** 歩いた距離（コマ送りに使う） */
  walked: number;
}

// ---------------------------------------------------------------- 背景の絵

const MAP_URL = 'assets/maps/village.jpg';
let bg: HTMLImageElement | null = null;
let bgReady = false;
let cutouts: { img: HTMLCanvasElement; x: number; y: number; baseY: number }[] = [];

function bounds(poly: Poly): { x0: number; y0: number; x1: number; y1: number } {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { x0: Math.floor(Math.min(...xs)), y0: Math.floor(Math.min(...ys)), x1: Math.ceil(Math.max(...xs)), y1: Math.ceil(Math.max(...ys)) };
}

/** 背景の絵を読み込み、手前に来る物（建物・木など）を切り抜いておく */
export function loadWorldArt(): void {
  if (bg) return;
  bg = new Image();
  bg.onload = () => {
    bgReady = true;
    cutouts = OCCLUDERS.map((o) => {
      const b = bounds(o.poly);
      const [c, ctx] = makeCanvas(b.x1 - b.x0, b.y1 - b.y0);
      ctx.beginPath();
      o.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x - b.x0, y - b.y0) : ctx.moveTo(x - b.x0, y - b.y0)));
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(bg!, -b.x0, -b.y0);
      return { img: c, x: b.x0, y: b.y0, baseY: o.baseY };
    });
  };
  bg.src = MAP_URL;
}

export function cameraFor(s: GameState): Camera {
  return {
    x: Math.round(Math.max(0, Math.min(WORLD_W - VIEW_W, s.player.x - VIEW_W / 2))),
    y: Math.round(Math.max(0, Math.min(WORLD_H - VIEW_H, s.player.y - 24 - VIEW_H / 2))),
  };
}

// ---------------------------------------------------------------- 畑

const plotCache = new Map<string, HTMLCanvasElement>();

/** 区画の土（絵の畝の上に重ねる）。縁は少しぼかして、背景の絵になじませる */
function plotImage(i: number, tilled: boolean): HTMLCanvasElement {
  const key = `${i}:${tilled}`;
  const hit = plotCache.get(key);
  if (hit) return hit;
  const p = PLOTS[i];
  const w = p.x1 - p.x0;
  const h = p.y1 - p.y0;
  const [c, ctx] = makeCanvas(w, h);
  const r = rng(1000 + i * 7 + (tilled ? 1 : 0));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (edge < 2 && r() < 0.5 - edge * 0.2) continue;
      const n = r();
      let col: string;
      if (tilled) {
        // 横の畝（明るい筋と暗い溝）
        const row = y % 8;
        col = row < 2 ? '#5e4030' : row < 5 ? (n < 0.3 ? '#8a6244' : '#80583a') : n < 0.2 ? '#6c4a34' : '#704c32';
      } else {
        // 耕していない土：草まじり
        col = n < 0.08 ? '#82a050' : n < 0.5 ? '#8c6c4c' : n < 0.85 ? '#86664a' : '#7a5c40';
      }
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  if (!tilled) {
    // 雑草の小さな株
    for (let k = 0; k < 9; k++) {
      const x = 4 + Math.floor(r() * (w - 8));
      const y = 5 + Math.floor(r() * (h - 8));
      ctx.fillStyle = '#4f7a2e';
      ctx.fillRect(x, y - 3, 1, 3);
      ctx.fillRect(x - 1, y - 2, 1, 1);
      ctx.fillRect(x + 1, y - 2, 1, 1);
      ctx.fillStyle = '#93c25a';
      ctx.fillRect(x, y - 4, 1, 1);
    }
  }
  plotCache.set(key, c);
  return c;
}

/** 作物1株（足元 x, y）。stage 0 芽 / 1 若葉 / 2 育ち / 3 収穫どき */
function drawPlant(ctx: Ctx, crop: CropId, stage: number, x: number, y: number, stalled: boolean): void {
  const leaf = stalled ? '#9a9450' : '#5cbf4a';
  const dark = stalled ? '#6e6a38' : '#2f7a2c';
  const light = stalled ? '#b8b070' : '#9be26a';
  const px = (dx: number, dy: number, c: string, w = 1, h = 1) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + dx, y + dy, w, h);
  };
  if (stage === 0) {
    px(0, -3, dark, 1, 3);
    px(-2, -5, leaf, 2, 2);
    px(1, -5, leaf, 2, 2);
    px(-2, -5, light);
    return;
  }
  const h = stage === 1 ? 9 : 15;
  px(0, -h, dark, 1, h);
  for (let k = 3; k < h; k += 3) {
    const side = (k / 3) % 2 === 0 ? -1 : 1;
    if (crop === 'bean') {
      px(side < 0 ? -4 : 1, -k - 1, leaf, 3, 2);
      px(side < 0 ? -4 : 1, -k - 1, light);
    } else {
      px(side < 0 ? -3 : 1, -k, leaf, 3, 1);
      px(side < 0 ? -4 : 3, -k - 1, leaf);
    }
  }
  if (stage >= 2 && crop === 'wheat') {
    // 麦の穂
    const ripe = stage === 3;
    px(-1, -h - 5, ripe ? '#f0c850' : '#a8c860', 3, 5);
    px(0, -h - 7, ripe ? '#ffe08a' : '#c8e080', 1, 2);
    px(-1, -h - 5, ripe ? '#c89a2a' : '#7ea040');
  }
  if (stage === 3 && crop === 'bean') {
    // 豆のさや
    px(-4, -8, '#b6e070', 2, 5);
    px(3, -11, '#b6e070', 2, 5);
    px(-4, -8, '#e8ffb0');
    px(3, -11, '#e8ffb0');
  }
}

function drawPlot(ctx: Ctx, i: number, p: Plot, cam: Camera, items: Drawable[]): void {
  const r = PLOTS[i];
  ctx.drawImage(plotImage(i, p.stage !== 'wild'), r.x0 - cam.x, r.y0 - cam.y);
  if (!p.crop) return;
  const crop = p.crop;
  const stage = p.stage === 'ready' ? 3 : Math.min(2, Math.floor((p.growth / CROPS[crop].days) * 3));
  // 1区画に3列x3段で植える
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++) {
      const x = Math.round(r.x0 + ((col + 0.5) * (r.x1 - r.x0)) / 3 + (row % 2) * 2 - cam.x);
      const fy = r.y0 + ((row + 0.85) * (r.y1 - r.y0)) / 3;
      const y = Math.round(fy - cam.y);
      items.push({ y: fy, draw: (c) => drawPlant(c, crop, stage, x, y, p.stalled) });
    }
}

// ---------------------------------------------------------------- 人物

type Drawable = { y: number; draw: (ctx: Ctx) => void };

function companionDrawable(c: Companion, kind: 'moku' | 'momo', asleep: boolean, t: number, cam: Camera): Drawable {
  const x = c.x - cam.x;
  // 飛べる2匹なので、起きているときはふわふわ浮く
  const float = asleep ? 0 : Math.round(Math.sin(t * 4 + (kind === 'moku' ? 0 : 2)) * 2) - (kind === 'momo' ? 10 : 3);
  const y = c.y - cam.y;
  return {
    y: c.y,
    draw: (ctx) => {
      drawShadow(ctx, x, y, asleep ? 20 : 16);
      const frames = kind === 'moku' ? MOKU : MOMO;
      let def = asleep ? frames.sleep : frames.idle;
      if (!asleep && Math.floor(t * (kind === 'momo' ? 8 : 3)) % (kind === 'momo' ? 2 : 4) === 0) def = kind === 'moku' ? MOKU.hop : MOMO.flap;
      drawAtFeet(ctx, def, x, y + float + 1, c.dir === 'left');
      if (asleep) {
        const z = Math.floor(t * 1.5) % 3;
        ctx.globalAlpha = 0.85;
        ctx.drawImage(spriteImage(ZZZ), Math.round(x + 8 + z * 2), Math.round(y - 38 - z * 5));
        ctx.globalAlpha = 1;
      }
    },
  };
}

// ---------------------------------------------------------------- 光

type RGB = [number, number, number];
/** 時刻ごとの色（乗算）。昼は白＝そのまま */
const SKY: [number, RGB][] = [
  [0, [62, 72, 140]],
  [4.5, [62, 72, 140]],
  [5.5, [140, 120, 170]],
  [6.5, [255, 214, 200]],
  [8, [255, 255, 255]],
  [16, [255, 255, 255]],
  [17.5, [255, 214, 165]],
  [19, [210, 140, 140]],
  [20.5, [110, 98, 170]],
  [22, [70, 80, 150]],
  [24, [62, 72, 140]],
];

export function skyColor(hour: number): RGB {
  for (let i = 1; i < SKY.length; i++) {
    const [h1, c1] = SKY[i];
    const [h0, c0] = SKY[i - 1];
    if (hour <= h1) {
      const k = (hour - h0) / (h1 - h0 || 1);
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k)) as RGB;
    }
  }
  return SKY[0][1];
}

/** 暗さ 0（昼）〜1（真夜中） */
export function darkness(hour: number): number {
  const [r, g, b] = skyColor(hour);
  return Math.min(1, Math.max(0, (1 - (r + g + b) / (3 * 255)) / 0.6));
}

function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('A', String(alpha)));
  g.addColorStop(1, color.replace('A', '0'));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

let vignette: HTMLCanvasElement | null = null;
function vignetteLayer(): HTMLCanvasElement {
  if (!vignette) {
    const [c, ctx] = makeCanvas(VIEW_W, VIEW_H);
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.62);
    g.addColorStop(0, 'rgba(10, 8, 24, 0)');
    g.addColorStop(1, 'rgba(10, 8, 24, 0.4)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    vignette = c;
  }
  return vignette;
}

// ---------------------------------------------------------------- 本体

export function drawWorld(ctx: Ctx, s: GameState, anim: PlayerAnim, t: number, clock = s.clock): Camera {
  loadWorldArt();
  const cam = cameraFor(s);
  if (bgReady && bg) ctx.drawImage(bg, cam.x, cam.y, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
  else {
    ctx.fillStyle = '#9cbf6a';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  const items: Drawable[] = [];
  s.plots.forEach((p, i) => drawPlot(ctx, i, p, cam, items));

  // 手前に来る絵（建物・木・噴水）
  for (const c of cutouts) items.push({ y: c.baseY, draw: (g) => g.drawImage(c.img, c.x - cam.x, c.y - cam.y) });

  // 仲間
  const moku = s.companions.moku;
  if (moku.met) items.push(companionDrawable(moku, 'moku', mokuAsleep(clock), t, cam));
  const momo = s.companions.momo;
  if (momo.met) items.push(companionDrawable(momo, 'momo', momoAsleep(clock), t, cam));

  // 主人公
  const p = s.player;
  const facing = p.dir === 'left' || p.dir === 'right' ? 'side' : p.dir;
  const step = anim.moving ? Math.floor(anim.walked / 9) % 4 : 0;
  items.push({
    y: p.y,
    draw: (c) => {
      drawShadow(c, p.x - cam.x, p.y - cam.y, 22);
      drawAtFeet(c, PLAYER[facing][step], p.x - cam.x, p.y - cam.y + 2, p.dir === 'left');
    },
  });

  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw(ctx);

  // ---- 時刻の光
  const hour = hourFloat(clock);
  const [r, g, b] = skyColor(hour);
  if (r + g + b < 765) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalCompositeOperation = 'source-over';
  }
  const dark = darkness(hour);
  const forgeBusy = s.forge.queue.length > 0 || s.forge.ready > 0;
  if (dark > 0.15) {
    ctx.globalCompositeOperation = 'lighter';
    for (const w of WINDOWS.hut) {
      glow(ctx, w.x - cam.x, w.y - cam.y, 10, 'rgba(255, 210, 120, A)', 0.8 * dark);
      glow(ctx, w.x - cam.x, w.y - cam.y + 14, 46, 'rgba(255, 170, 80, A)', 0.3 * dark);
    }
    glow(ctx, WINDOWS.forge.x - cam.x, WINDOWS.forge.y - cam.y, forgeBusy ? 14 : 8, 'rgba(255, 140, 60, A)', (forgeBusy ? 0.9 : 0.5) * dark);
    glow(ctx, WINDOWS.forge.x - cam.x, WINDOWS.forge.y - cam.y + 20, forgeBusy ? 70 : 36, 'rgba(255, 110, 40, A)', (forgeBusy ? 0.4 : 0.18) * dark);
    // ホタル（広場と川べり）
    for (let i = 0; i < 40; i++) {
      const fx = 400 + ((i * 397) % 1300) + Math.sin(t * 0.7 + i) * 30 - cam.x;
      const fy = 680 + ((i * 211) % 520) + Math.cos(t * 0.5 + i * 2) * 20 - cam.y;
      const blink = (Math.sin(t * 2 + i * 1.7) + 1) / 2;
      if (fx < -8 || fy < -8 || fx > VIEW_W + 8 || fy > VIEW_H + 8) continue;
      glow(ctx, fx, fy, 8, 'rgba(210, 255, 140, A)', 0.5 * blink * dark);
      ctx.fillStyle = `rgba(240, 255, 200, ${blink * dark})`;
      ctx.fillRect(Math.round(fx), Math.round(fy), 1, 1);
    }
    ctx.globalCompositeOperation = 'source-over';
  } else if (forgeBusy) {
    // 昼でも、炉が動いていれば窓がほんのり赤い
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, WINDOWS.forge.x - cam.x, WINDOWS.forge.y - cam.y, 10, 'rgba(255, 120, 50, A)', 0.35 + 0.1 * Math.sin(t * 6));
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(vignetteLayer(), 0, 0);
  return cam;
}
