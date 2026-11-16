// 地形と建物のドット絵。コードで塗って作り、一度作った画像は使い回す。
// ブロック状の自然（上面が明るく側面が暗い立方体）で、Minecraft を連想させつつ独自の見た目にする。
import { CROPS, CropId } from '../core/params.js';
import { Ctx, makeCanvas, rng } from './gfx.js';

const T = 16;

function tex(seed: number, w: number, h: number, base: string, dots: [string, number][]): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(w, h);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (const [col, density] of dots) {
    ctx.fillStyle = col;
    const n = Math.round(w * h * density);
    for (let i = 0; i < n; i++) ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 1);
  }
  return c;
}

// ---------------------------------------------------------------- 地面

const grassCache: HTMLCanvasElement[] = [];
export function grassTile(v: number): HTMLCanvasElement {
  const i = v % 4;
  if (!grassCache[i]) {
    const c = tex(11 + i * 7, T, T, '#5fa34b', [
      ['#6fb85a', 0.16],
      ['#4f8f3f', 0.12],
      ['#86c96a', 0.03],
    ]);
    const ctx = c.getContext('2d')!;
    const r = rng(31 + i);
    ctx.fillStyle = '#4a873b'; // 草の葉
    for (let k = 0; k < 3; k++) {
      const x = Math.floor(r() * 14) + 1;
      const y = Math.floor(r() * 13) + 2;
      ctx.fillRect(x, y, 1, 2);
      ctx.fillRect(x + 1, y - 1, 1, 2);
    }
    grassCache[i] = c;
  }
  return grassCache[i];
}

const flowerCache: HTMLCanvasElement[] = [];
export function flowerTile(v: number): HTMLCanvasElement {
  const i = v % 3;
  if (!flowerCache[i]) {
    const [c, ctx] = makeCanvas(T, T);
    ctx.drawImage(grassTile(i + 1), 0, 0);
    const colors = ['#fff4f0', '#ffe066', '#ff9ab8'];
    const r = rng(77 + i);
    for (let k = 0; k < 3; k++) {
      const x = 2 + Math.floor(r() * 11);
      const y = 2 + Math.floor(r() * 11);
      ctx.fillStyle = colors[(i + k) % 3];
      ctx.fillRect(x, y, 2, 1);
      ctx.fillRect(x, y - 1, 1, 1);
      ctx.fillStyle = '#e08a20';
      ctx.fillRect(x, y, 1, 1);
    }
    flowerCache[i] = c;
  }
  return flowerCache[i];
}

let pathImg: HTMLCanvasElement[] | null = null;
export function pathTile(v: number): HTMLCanvasElement {
  if (!pathImg)
    pathImg = [0, 1, 2].map((i) =>
      tex(101 + i, T, T, '#c9a46c', [
        ['#b48f5b', 0.12],
        ['#dcbb85', 0.08],
        ['#9c7a4b', 0.03],
      ]),
    );
  return pathImg[v % 3];
}

let sandImg: HTMLCanvasElement[] | null = null;
export function sandTile(v: number): HTMLCanvasElement {
  if (!sandImg)
    sandImg = [0, 1].map((i) =>
      tex(201 + i, T, T, '#e7d39c', [
        ['#d6bf86', 0.12],
        ['#f4e6bd', 0.08],
      ]),
    );
  return sandImg[v % 2];
}

/** 水（4コマで揺れる）。x, y は波の位相をずらすための位置 */
export function drawWater(ctx: Ctx, px: number, py: number, frame: number, x: number, y: number): void {
  ctx.fillStyle = '#3d7cc2';
  ctx.fillRect(px, py, T, T);
  ctx.fillStyle = '#336ab0';
  ctx.fillRect(px, py + 12, T, 4);
  ctx.fillStyle = '#6fa8e2';
  for (let k = 0; k < 3; k++) {
    const yy = (k * 5 + y * 3) % 14;
    const xx = (frame * 2 + k * 6 + x * 5) % 16;
    ctx.fillRect(px + xx, py + yy + 1, 4, 1);
    if (xx > 12) ctx.fillRect(px, py + yy + 1, xx - 12, 1);
  }
  ctx.fillStyle = '#a8d2f4';
  ctx.fillRect(px + ((frame * 3 + x * 7) % 14), py + ((y * 5 + 3) % 12), 1, 1);
}

let bridgeImg: HTMLCanvasElement | null = null;
export function bridgeTile(): HTMLCanvasElement {
  if (!bridgeImg) {
    const [c, ctx] = makeCanvas(T, T);
    ctx.fillStyle = '#a97b47';
    ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = '#7d5530';
    for (let y = 3; y < T; y += 4) ctx.fillRect(0, y, T, 1);
    ctx.fillStyle = '#c59762';
    for (let y = 0; y < T; y += 4) ctx.fillRect(0, y, T, 1);
    ctx.fillStyle = '#5e3d22';
    ctx.fillRect(0, 0, 1, T);
    ctx.fillRect(T - 1, 0, 1, T);
    bridgeImg = c;
  }
  return bridgeImg;
}

// ---------------------------------------------------------------- 畑

let wildPlot: HTMLCanvasElement | null = null;
let tilledPlot: HTMLCanvasElement | null = null;
export function plotTile(tilled: boolean): HTMLCanvasElement {
  if (!wildPlot) {
    wildPlot = tex(301, T, T, '#7a6a3c', [
      ['#5f8f3f', 0.25],
      ['#8a7a48', 0.1],
    ]);
    const [c, ctx] = makeCanvas(T, T);
    ctx.fillStyle = '#6e4a2c';
    ctx.fillRect(0, 0, T, T);
    for (let y = 1; y < T; y += 4) {
      ctx.fillStyle = '#87603a';
      ctx.fillRect(1, y, T - 2, 2);
      ctx.fillStyle = '#56381f';
      ctx.fillRect(1, y + 2, T - 2, 1);
    }
    ctx.fillStyle = '#4a2f1a';
    ctx.fillRect(0, 0, T, 1);
    ctx.fillRect(0, 0, 1, T);
    tilledPlot = c;
  }
  return tilled ? tilledPlot! : wildPlot;
}

/** 作物（成長の割合 0〜1 で4段階）。足元 (x, y) 基準 */
export function drawCrop(ctx: Ctx, crop: CropId, growth: number, ready: boolean, x: number, y: number, stalled: boolean): void {
  const stage = ready ? 3 : Math.min(2, Math.floor((growth / CROPS[crop].days) * 3));
  const leaf = stalled ? '#8a8a4a' : '#5cbf4a';
  const dark = stalled ? '#6a6a3a' : '#3c8a33';
  for (const dx of [-4, 4]) {
    const cx = x + dx;
    if (stage === 0) {
      ctx.fillStyle = dark;
      ctx.fillRect(cx, y - 3, 1, 2);
      ctx.fillStyle = leaf;
      ctx.fillRect(cx - 1, y - 4, 1, 1);
      ctx.fillRect(cx + 1, y - 4, 1, 1);
      continue;
    }
    const h = stage === 1 ? 6 : 10;
    ctx.fillStyle = dark;
    ctx.fillRect(cx, y - h, 1, h);
    ctx.fillStyle = leaf;
    for (let k = 2; k < h; k += 3) {
      ctx.fillRect(cx - 2, y - k, 2, 1);
      ctx.fillRect(cx + 1, y - k - 1, 2, 1);
    }
    if (stage === 3) {
      if (crop === 'bean') {
        ctx.fillStyle = '#8fd46a';
        ctx.fillRect(cx - 2, y - 8, 1, 3);
        ctx.fillRect(cx + 2, y - 6, 1, 3);
      } else {
        ctx.fillStyle = '#f0c850';
        ctx.fillRect(cx - 1, y - h - 3, 3, 4);
        ctx.fillStyle = '#c89a2a';
        ctx.fillRect(cx, y - h - 2, 1, 2);
      }
    }
  }
}

// ---------------------------------------------------------------- 木・岩・立て札（足元の y で前後を決める）

const treeCache: HTMLCanvasElement[] = [];
/** ブロック状の木（幅24・高さ34）。足元はタイルの下端 */
export function treeImage(v: number): HTMLCanvasElement {
  const i = v % 3;
  if (!treeCache[i]) {
    const [c, ctx] = makeCanvas(24, 34);
    // 幹
    ctx.fillStyle = '#7a5232';
    ctx.fillRect(9, 20, 6, 14);
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(13, 20, 2, 14);
    ctx.fillStyle = '#93673f';
    ctx.fillRect(9, 20, 1, 14);
    // 葉のブロック（上面・正面・側面）
    const greens = [
      ['#78c25a', '#4f9a3e', '#3a7a30'],
      ['#6bb552', '#47903a', '#336e2c'],
      ['#86c860', '#58a043', '#3e7f33'],
    ][i];
    ctx.fillStyle = greens[1];
    ctx.fillRect(1, 6, 22, 16);
    ctx.fillStyle = greens[0];
    ctx.fillRect(1, 2, 22, 5);
    ctx.fillStyle = greens[2];
    ctx.fillRect(17, 6, 6, 16);
    ctx.fillRect(1, 20, 22, 2);
    const r = rng(401 + i);
    for (let k = 0; k < 40; k++) {
      ctx.fillStyle = r() < 0.5 ? greens[0] : greens[2];
      ctx.fillRect(1 + Math.floor(r() * 21), 6 + Math.floor(r() * 14), 1, 1);
    }
    // 輪郭
    ctx.fillStyle = '#1d2a1c';
    ctx.fillRect(0, 2, 1, 20);
    ctx.fillRect(23, 2, 1, 20);
    ctx.fillRect(1, 1, 22, 1);
    ctx.fillRect(1, 22, 22, 1);
    // 実（ときどき）
    if (i === 2) {
      ctx.fillStyle = '#e0404f';
      ctx.fillRect(5, 12, 2, 2);
      ctx.fillRect(14, 9, 2, 2);
      ctx.fillRect(9, 16, 2, 2);
    }
    treeCache[i] = c;
  }
  return treeCache[i];
}

let rockImg: HTMLCanvasElement | null = null;
export function rockImage(): HTMLCanvasElement {
  if (!rockImg) {
    const [c, ctx] = makeCanvas(16, 16);
    ctx.fillStyle = '#1d1a26';
    ctx.fillRect(1, 3, 14, 13);
    ctx.fillStyle = '#8c8f9c';
    ctx.fillRect(2, 7, 12, 8);
    ctx.fillStyle = '#b4b7c2';
    ctx.fillRect(2, 4, 12, 3);
    ctx.fillStyle = '#6d707d';
    ctx.fillRect(10, 7, 4, 8);
    ctx.fillStyle = '#a0a3ae';
    ctx.fillRect(4, 9, 2, 1);
    ctx.fillRect(7, 12, 2, 1);
    rockImg = c;
  }
  return rockImg;
}

let signImg: HTMLCanvasElement | null = null;
export function signImage(): HTMLCanvasElement {
  if (!signImg) {
    const [c, ctx] = makeCanvas(16, 20);
    ctx.fillStyle = '#5e3d22';
    ctx.fillRect(7, 10, 2, 10);
    ctx.fillStyle = '#1d1828';
    ctx.fillRect(1, 1, 14, 10);
    ctx.fillStyle = '#c59762';
    ctx.fillRect(2, 2, 12, 8);
    ctx.fillStyle = '#7d5530';
    ctx.fillRect(4, 4, 8, 1);
    ctx.fillRect(4, 7, 6, 1);
    signImg = c;
  }
  return signImg;
}

// ---------------------------------------------------------------- 小屋（48x64）と炉（32x44）

let hutImg: HTMLCanvasElement | null = null;
/** 足元は小屋の下端。窓は夜に灯す（world.ts で光を足す） */
export function hutImage(): HTMLCanvasElement {
  if (!hutImg) {
    const [c, ctx] = makeCanvas(48, 64);
    // 丸太の壁
    for (let y = 26; y < 62; y += 4) {
      ctx.fillStyle = '#9a6a3c';
      ctx.fillRect(2, y, 44, 3);
      ctx.fillStyle = '#7a5030';
      ctx.fillRect(2, y + 3, 44, 1);
      ctx.fillStyle = '#b5824e';
      ctx.fillRect(2, y, 44, 1);
    }
    ctx.fillStyle = '#5e3d22';
    ctx.fillRect(2, 26, 3, 36);
    ctx.fillRect(43, 26, 3, 36);
    // 屋根（段々）
    const roof = ['#b8483c', '#9a3a31', '#7c2e28'];
    for (let k = 0; k < 7; k++) {
      const y = 4 + k * 3;
      const inset = Math.max(0, 12 - k * 2);
      ctx.fillStyle = roof[k % 2];
      ctx.fillRect(inset, y, 48 - inset * 2, 3);
      ctx.fillStyle = roof[2];
      ctx.fillRect(inset, y + 2, 48 - inset * 2, 1);
    }
    ctx.fillStyle = '#d0665a';
    ctx.fillRect(12, 4, 24, 1);
    // 煙突
    ctx.fillStyle = '#6d707d';
    ctx.fillRect(34, 0, 6, 10);
    ctx.fillStyle = '#8c8f9c';
    ctx.fillRect(34, 0, 6, 2);
    // 扉（下の段の真ん中）
    ctx.fillStyle = '#1d1828';
    ctx.fillRect(18, 42, 12, 20);
    ctx.fillStyle = '#6e4628';
    ctx.fillRect(19, 43, 10, 19);
    ctx.fillStyle = '#5a3820';
    ctx.fillRect(23, 43, 1, 19);
    ctx.fillStyle = '#e8c050';
    ctx.fillRect(26, 52, 1, 2);
    // 窓
    for (const wx of [6, 34]) {
      ctx.fillStyle = '#1d1828';
      ctx.fillRect(wx, 34, 9, 9);
      ctx.fillStyle = '#5a7fa8';
      ctx.fillRect(wx + 1, 35, 7, 7);
      ctx.fillStyle = '#8fb4d8';
      ctx.fillRect(wx + 1, 35, 3, 3);
      ctx.fillStyle = '#5e3d22';
      ctx.fillRect(wx + 4, 35, 1, 7);
      ctx.fillRect(wx + 1, 38, 7, 1);
    }
    // 輪郭
    ctx.fillStyle = '#1d1828';
    ctx.fillRect(1, 26, 1, 36);
    ctx.fillRect(46, 26, 1, 36);
    ctx.fillRect(1, 62, 46, 2);
    hutImg = c;
  }
  return hutImg;
}

/** 窓の位置（小屋画像の左上からの、窓の中心） */
export const HUT_WINDOWS = [
  { x: 10, y: 38 },
  { x: 38, y: 38 },
];

let forgeImg: HTMLCanvasElement | null = null;
export function forgeImage(): HTMLCanvasElement {
  if (!forgeImg) {
    const [c, ctx] = makeCanvas(32, 44);
    // 石のブロック
    ctx.fillStyle = '#1d1828';
    ctx.fillRect(0, 10, 32, 34);
    for (let y = 11; y < 43; y += 6) {
      for (let x = 1; x < 31; x += 10) {
        const off = ((y - 11) / 6) % 2 === 0 ? 0 : 5;
        ctx.fillStyle = '#8c8f9c';
        ctx.fillRect(x + off - 5 < 1 ? 1 : x + off - 5, y, 9, 5);
        ctx.fillStyle = '#a7aab6';
        ctx.fillRect(x + off - 5 < 1 ? 1 : x + off - 5, y, 9, 1);
      }
    }
    ctx.fillStyle = '#6d707d';
    ctx.fillRect(25, 11, 6, 32);
    // 上面
    ctx.fillStyle = '#b4b7c2';
    ctx.fillRect(1, 11, 30, 3);
    // 煙突
    ctx.fillStyle = '#1d1828';
    ctx.fillRect(10, 0, 12, 12);
    ctx.fillStyle = '#7d808d';
    ctx.fillRect(11, 1, 10, 11);
    ctx.fillStyle = '#9a9daa';
    ctx.fillRect(11, 1, 10, 2);
    // 火の口
    ctx.fillStyle = '#1d1828';
    ctx.fillRect(9, 26, 14, 12);
    ctx.fillStyle = '#2a1a18';
    ctx.fillRect(10, 27, 12, 11);
    forgeImg = c;
  }
  return forgeImg;
}

/** 炉の火（ゆらぐ）。forge 画像と同じ左上を基準に描く */
export function drawForgeFire(ctx: Ctx, x: number, y: number, t: number, strong: boolean): void {
  const flick = Math.floor(t * 8) % 3;
  ctx.fillStyle = strong ? '#ff7a2a' : '#a8401e';
  ctx.fillRect(x + 11, y + 32 - flick, 10, 6 + flick);
  ctx.fillStyle = strong ? '#ffd050' : '#d0702a';
  ctx.fillRect(x + 13 + flick, y + 34 - flick, 5, 4 + flick);
  if (strong) {
    ctx.fillStyle = '#fff4c0';
    ctx.fillRect(x + 15, y + 36, 2, 2);
  }
}
