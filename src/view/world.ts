// フィールドの描画：地面 → 物と人物（足元の y で前後を決める）→ 時刻の光 → 周辺減光。
import { hourFloat } from '../core/clock.js';
import { FORGE_AT, HUT, MAP_H, MAP_W, SIGN_AT, TILE, tileAt, TILES, tileHash } from '../core/map.js';
import { mokuAsleep, momoAsleep } from '../core/sim.js';
import { Companion, GameState } from '../core/state.js';
import { BASE_H, BASE_W, Ctx, drawAtFeet, drawShadow, makeCanvas, spriteImage } from './gfx.js';
import { MOKU, MOMO, PLAYER, ZZZ } from './sprites.js';
import {
  bridgeTile,
  drawCrop,
  drawForgeFire,
  drawWater,
  flowerTile,
  forgeImage,
  grassTile,
  HUT_WINDOWS,
  hutImage,
  pathTile,
  plotTile,
  rockImage,
  sandTile,
  signImage,
  treeImage,
} from './tiles.js';

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

let ground: HTMLCanvasElement | null = null;

/** 動かない地面を1枚の画像にしておく（水と畑は毎フレーム描く） */
function groundLayer(): HTMLCanvasElement {
  if (ground) return ground;
  const [c, ctx] = makeCanvas(MAP_W * TILE, MAP_H * TILE);
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const v = Math.floor(tileHash(x, y, 3) * 12);
      const tile = TILES[y][x];
      const px = x * TILE;
      const py = y * TILE;
      if (tile === 'flower') ctx.drawImage(flowerTile(v), px, py);
      else if (tile === 'path') ctx.drawImage(pathTile(v), px, py);
      else if (tile === 'sand') ctx.drawImage(sandTile(v), px, py);
      else if (tile === 'bridge') ctx.drawImage(bridgeTile(), px, py);
      else ctx.drawImage(grassTile(v), px, py);
    }
  // 道と草の境目に、草の縁取りを少し落とす
  ctx.fillStyle = 'rgba(60, 110, 40, 0.35)';
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      if (TILES[y][x] !== 'path') continue;
      if (y > 0 && TILES[y - 1][x] !== 'path') ctx.fillRect(x * TILE, y * TILE, TILE, 1);
      if (x > 0 && TILES[y][x - 1] !== 'path' && TILES[y][x - 1] !== 'bridge') ctx.fillRect(x * TILE, y * TILE, 1, TILE);
    }
  ground = c;
  return c;
}

export function cameraFor(s: GameState): Camera {
  const maxX = MAP_W * TILE - BASE_W;
  const maxY = MAP_H * TILE - BASE_H;
  return {
    x: Math.round(Math.max(0, Math.min(maxX, s.player.x - BASE_W / 2))),
    y: Math.round(Math.max(0, Math.min(maxY, s.player.y - 12 - BASE_H / 2))),
  };
}

type Drawable = { y: number; draw: (ctx: Ctx) => void };

function companionDrawable(c: Companion, kind: 'moku' | 'momo', asleep: boolean, t: number, cam: Camera): Drawable {
  const x = c.x - cam.x;
  // 飛べる2匹なので、起きているときはふわふわ浮く
  const float = asleep ? 0 : Math.round(Math.sin(t * 4 + (kind === 'moku' ? 0 : 2)) * 1.5) - 2;
  const y = c.y - cam.y;
  return {
    y: c.y,
    draw: (ctx) => {
      drawShadow(ctx, x, y, 10);
      const frames = kind === 'moku' ? MOKU : MOMO;
      let def = asleep ? frames.sleep : frames.idle;
      if (!asleep && Math.floor(t * 3) % 4 === 0) def = kind === 'moku' ? MOKU.hop : MOMO.flap;
      drawAtFeet(ctx, def, x, y + float, c.dir === 'left');
      if (asleep) {
        const z = Math.floor(t * 1.5) % 3;
        ctx.globalAlpha = 0.85;
        ctx.drawImage(spriteImage(ZZZ), Math.round(x + 4 + z), Math.round(y - 20 - z * 3));
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
    const [c, ctx] = makeCanvas(BASE_W, BASE_H);
    const g = ctx.createRadialGradient(BASE_W / 2, BASE_H / 2, BASE_H * 0.45, BASE_W / 2, BASE_H / 2, BASE_W * 0.62);
    g.addColorStop(0, 'rgba(10, 8, 24, 0)');
    g.addColorStop(1, 'rgba(10, 8, 24, 0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BASE_W, BASE_H);
    vignette = c;
  }
  return vignette;
}

// ---------------------------------------------------------------- 本体

export function drawWorld(ctx: Ctx, s: GameState, anim: PlayerAnim, t: number, clock = s.clock): Camera {
  const cam = cameraFor(s);
  ctx.drawImage(groundLayer(), -cam.x, -cam.y);

  const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1);
  const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
  const x1 = Math.min(MAP_W - 1, Math.ceil((cam.x + BASE_W) / TILE) + 1);
  const y1 = Math.min(MAP_H - 1, Math.ceil((cam.y + BASE_H) / TILE) + 3);
  const waterFrame = Math.floor(t * 3) % 8;

  const items: Drawable[] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const tile = tileAt(x, y);
      const px = x * TILE - cam.x;
      const py = y * TILE - cam.y;
      if (tile === 'water') drawWater(ctx, px, py, waterFrame, x, y);
      else if (tile === 'tree') {
        const v = Math.floor(tileHash(x, y, 5) * 3);
        items.push({ y: (y + 1) * TILE, draw: (c) => c.drawImage(treeImage(v), px - 4, py + TILE - 34) });
      } else if (tile === 'rock') items.push({ y: (y + 1) * TILE - 2, draw: (c) => c.drawImage(rockImage(), px, py) });
      else if (tile === 'sign' && x === SIGN_AT.tx) items.push({ y: (y + 1) * TILE, draw: (c) => c.drawImage(signImage(), px, py - 4) });
    }

  // 畑
  for (const p of s.plots) {
    const px = p.tx * TILE - cam.x;
    const py = p.ty * TILE - cam.y;
    ctx.drawImage(plotTile(p.stage !== 'wild'), px, py);
    if (p.crop) items.push({ y: (p.ty + 1) * TILE - 2, draw: (c) => drawCrop(c, p.crop!, p.growth, p.stage === 'ready', px + 8, py + 14, p.stalled) });
  }

  // 小屋と炉
  const hutX = HUT.tx * TILE - cam.x;
  const hutY = (HUT.ty + HUT.h) * TILE - 64 - cam.y;
  items.push({ y: (HUT.ty + HUT.h) * TILE - 1, draw: (c) => c.drawImage(hutImage(), hutX, hutY) });
  const fX = FORGE_AT.tx * TILE - cam.x;
  const fY = (FORGE_AT.ty + FORGE_AT.h) * TILE - 44 - cam.y;
  const forgeBusy = s.forge.queue.length > 0 || s.forge.ready > 0;
  items.push({
    y: (FORGE_AT.ty + FORGE_AT.h) * TILE - 1,
    draw: (c) => {
      c.drawImage(forgeImage(), fX, fY);
      drawForgeFire(c, fX, fY, t, forgeBusy);
    },
  });

  // 仲間
  const moku = s.companions.moku;
  if (moku.met) items.push(companionDrawable(moku, 'moku', mokuAsleep(clock), t, cam));
  const momo = s.companions.momo;
  if (momo.met) items.push(companionDrawable(momo, 'momo', momoAsleep(clock), t, cam));

  // 主人公
  const p = s.player;
  const facing = p.dir === 'left' || p.dir === 'right' ? 'side' : p.dir;
  const step = anim.moving ? Math.floor(anim.walked / 6) % 4 : 0;
  items.push({
    y: p.y,
    draw: (c) => {
      drawShadow(c, p.x - cam.x, p.y - cam.y, 12);
      drawAtFeet(c, PLAYER[facing][step], p.x - cam.x, p.y - cam.y + 1, p.dir === 'left');
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
    ctx.fillRect(0, 0, BASE_W, BASE_H);
    ctx.globalCompositeOperation = 'source-over';
  }
  const dark = darkness(hour);
  if (dark > 0.15) {
    ctx.globalCompositeOperation = 'lighter';
    for (const w of HUT_WINDOWS) {
      ctx.fillStyle = `rgba(255, 200, 110, ${0.7 * dark})`;
      ctx.fillRect(hutX + w.x - 3, hutY + w.y - 3, 7, 7);
      glow(ctx, hutX + w.x, hutY + w.y + 6, 34, 'rgba(255, 170, 80, A)', 0.35 * dark);
    }
    glow(ctx, fX + 16, fY + 34, forgeBusy ? 46 : 26, 'rgba(255, 120, 40, A)', (forgeBusy ? 0.45 : 0.2) * dark);
    // ホタル
    for (let i = 0; i < 14; i++) {
      const fx = ((i * 97 + Math.sin(t * 0.7 + i) * 30) % (MAP_W * TILE)) - cam.x;
      const fy = ((i * 53 + 120 + Math.cos(t * 0.5 + i * 2) * 20) % (MAP_H * TILE)) - cam.y;
      const blink = (Math.sin(t * 2 + i * 1.7) + 1) / 2;
      if (fx < -8 || fy < -8 || fx > BASE_W + 8 || fy > BASE_H + 8) continue;
      glow(ctx, fx, fy, 6, 'rgba(210, 255, 140, A)', 0.5 * blink * dark);
      ctx.fillStyle = `rgba(240, 255, 200, ${blink * dark})`;
      ctx.fillRect(Math.round(fx), Math.round(fy), 1, 1);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(vignetteLayer(), 0, 0);
  return cam;
}
