// フィールドの描画：背景の絵 → 水の動き・畑 → 物と人物（足元の y で前後を決める。絵の建物や木は切り抜きを手前に重ねる）
// → 時刻の光 → 周辺減光。座標はエリアの絵の px（ワールド単位）。画面には 800x450 の範囲を映す。
import { hourFloat } from '../core/clock.js';
import { AreaId, AREAS, inPoly, PEN, PLOTS, Poly, WINDOWS } from '../core/map.js';
import { CROPS, CropId } from '../core/params.js';
import { mokuAsleep, momoAsleep } from '../core/sim.js';
import { Companion, GameState, Plot } from '../core/state.js';
import { Ctx, drawAtFeet, drawShadow, makeCanvas, rng, spriteImage, VIEW_H, VIEW_W } from './gfx.js';
import { interiorImage, SMITHY_FIRE } from './interior.js';
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

// ---------------------------------------------------------------- 背景の絵と、手前に重ねる切り抜き

interface Cutout {
  img: HTMLCanvasElement;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  baseY: number;
}

const art = new Map<AreaId, { img: HTMLImageElement; ready: boolean; cutouts: Cutout[] }>();

function bounds(poly: Poly): { x0: number; y0: number; x1: number; y1: number } {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { x0: Math.floor(Math.min(...xs)) - 3, y0: Math.floor(Math.min(...ys)) - 3, x1: Math.ceil(Math.max(...xs)) + 3, y1: Math.ceil(Math.max(...ys)) + 3 };
}

/** 輪郭を少しぼかして切り抜く（人物との境目が目立たないように） */
function cutout(img: HTMLImageElement, poly: Poly, baseY: number): Cutout {
  const b = bounds(poly);
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const [mask, m] = makeCanvas(w, h);
  m.beginPath();
  poly.forEach(([x, y], i) => (i ? m.lineTo(x - b.x0, y - b.y0) : m.moveTo(x - b.x0, y - b.y0)));
  m.closePath();
  m.fillStyle = '#000';
  m.fill();
  const [c, ctx] = makeCanvas(w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, -b.x0, -b.y0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.filter = 'blur(1.5px)';
  ctx.drawImage(mask, 0, 0);
  ctx.filter = 'none';
  return { img: c, ...b, baseY };
}

function areaArt(area: AreaId) {
  let a = art.get(area);
  const src = AREAS[area].image;
  if (!a && src) {
    const img = new Image();
    const entry = { img, ready: false, cutouts: [] as Cutout[] };
    img.onload = () => {
      entry.ready = true;
      entry.cutouts = AREAS[area].occluders.map((o) => cutout(img, o.poly, o.baseY));
    };
    img.src = src;
    art.set(area, entry);
    a = entry;
  }
  return a;
}

const COW_SRC = ['assets/sprites/cow1.png', 'assets/sprites/cow2.png'];
const cowImgs = COW_SRC.map((src) => {
  const i = new Image();
  i.src = src;
  return i;
});

export function cameraFor(s: GameState): Camera {
  const a = AREAS[s.player.area];
  return {
    x: Math.round(Math.max(0, Math.min(a.w - VIEW_W, s.player.x - VIEW_W / 2))),
    y: Math.round(Math.max(0, Math.min(a.h - VIEW_H, s.player.y - 30 - VIEW_H / 2))),
  };
}

// ---------------------------------------------------------------- ウシ（牧場の中を歩き回る。表示だけの動き）

interface Cow {
  img: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** 元の絵が右向きなら 1、左向きなら -1 */
  faceSrc: number;
  face: number;
  wait: number;
  walking: boolean;
  phase: number;
}

const cowRng = rng(4242);
const cows: Cow[] = [
  { img: 0, x: 522, y: 870, tx: 522, ty: 870, faceSrc: 1, face: 1, wait: 2, walking: false, phase: 0 },
  { img: 1, x: 590, y: 812, tx: 590, ty: 812, faceSrc: -1, face: -1, wait: 4, walking: false, phase: 1.3 },
];

function randomInPen(): [number, number] {
  for (let i = 0; i < 40; i++) {
    const x = 490 + cowRng() * 190;
    const y = 772 + cowRng() * 100;
    if (inPoly(x, y, PEN)) return [x, y];
  }
  return [560, 820];
}

export function updateCows(dt: number): void {
  for (const c of cows) {
    if (c.walking) {
      const dx = c.tx - c.x;
      const dy = c.ty - c.y;
      const d = Math.hypot(dx, dy);
      if (d < 1.5) {
        c.walking = false;
        c.wait = 2 + cowRng() * 6;
      } else {
        const sp = 13 * dt;
        c.x += (dx / d) * sp;
        c.y += (dy / d) * sp;
        if (Math.abs(dx) > 2) c.face = dx > 0 ? 1 : -1;
        // もう1頭とぶつかりそうなら、いったん止まる
        const other = cows.find((o) => o !== c)!;
        if (Math.hypot(other.x - c.x, other.y - c.y) < 34) {
          c.walking = false;
          c.wait = 1 + cowRng() * 2;
        }
      }
    } else {
      c.wait -= dt;
      if (c.wait <= 0) {
        [c.tx, c.ty] = randomInPen();
        c.walking = true;
      }
    }
  }
}

function cowDrawable(c: Cow, t: number): Drawable {
  return {
    y: c.y,
    x: c.x,
    draw: (ctx) => {
      const img = cowImgs[c.img];
      if (!img.complete || !img.naturalWidth) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const bob = c.walking ? Math.abs(Math.sin(t * 7 + c.phase)) * 1.2 : Math.sin(t * 1.5 + c.phase) * 0.4;
      const tilt = c.walking ? Math.sin(t * 7 + c.phase) * 0.025 : 0;
      drawShadow(ctx, c.x, c.y - 2, w * 0.8);
      ctx.save();
      ctx.translate(c.x, c.y - bob);
      ctx.rotate(tilt);
      ctx.scale(c.face * c.faceSrc, 1);
      ctx.drawImage(img, -w / 2, -h + 4);
      ctx.restore();
    },
  };
}

// ---------------------------------------------------------------- 畑（水彩風に、やわらかい塗りと線で描く）

function plotPath(ctx: Ctx, i: number, inset = 0): void {
  const p = PLOTS[i];
  const r = rng(300 + i);
  const pts: [number, number][] = [];
  const n = 18;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const cx = (p.x0 + p.x1) / 2;
    const cy = (p.y0 + p.y1) / 2;
    const rx = (p.x1 - p.x0) / 2 - inset;
    const ry = (p.y1 - p.y0) / 2 - inset;
    // 角の丸い四角に近い形（超楕円）
    const c = Math.cos(a);
    const s = Math.sin(a);
    const ex = Math.sign(c) * Math.pow(Math.abs(c), 0.35);
    const ey = Math.sign(s) * Math.pow(Math.abs(s), 0.35);
    pts.push([cx + ex * rx + (r() - 0.5) * 2, cy + ey * ry + (r() - 0.5) * 2]);
  }
  ctx.beginPath();
  pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function drawPlotGround(ctx: Ctx, i: number, p: Plot): void {
  const b = PLOTS[i];
  const tilled = p.stage !== 'wild';
  ctx.save();
  plotPath(ctx, i);
  const g = ctx.createLinearGradient(b.x0, b.y0, b.x1, b.y1);
  if (tilled) {
    g.addColorStop(0, '#9a6e4a');
    g.addColorStop(1, '#7c5636');
  } else {
    g.addColorStop(0, '#9c8a5c');
    g.addColorStop(1, '#86744c');
  }
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  const r = rng(500 + i * 3 + (tilled ? 1 : 0));
  if (tilled) {
    // 畝の溝（少しゆれた横線）
    ctx.strokeStyle = 'rgba(60, 38, 24, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (let y = b.y0 + 7; y < b.y1 - 2; y += 9) {
      ctx.beginPath();
      ctx.moveTo(b.x0 + 3, y + (r() - 0.5) * 1.5);
      ctx.quadraticCurveTo((b.x0 + b.x1) / 2, y + (r() - 0.5) * 3, b.x1 - 3, y + (r() - 0.5) * 1.5);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(190, 150, 110, 0.35)';
      ctx.beginPath();
      ctx.moveTo(b.x0 + 3, y - 2.5);
      ctx.lineTo(b.x1 - 3, y - 2.5);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(60, 38, 24, 0.55)';
    }
  } else {
    // 雑草の筆の跡
    for (let k = 0; k < 14; k++) {
      const x = b.x0 + 5 + r() * (b.x1 - b.x0 - 10);
      const y = b.y0 + 8 + r() * (b.y1 - b.y0 - 12);
      ctx.strokeStyle = r() < 0.5 ? 'rgba(96, 130, 60, 0.85)' : 'rgba(130, 160, 80, 0.8)';
      ctx.lineWidth = 1.3;
      for (const dx of [-2.5, 0, 2.5]) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + dx * 0.5, y - 3, x + dx, y - 5 - r() * 2);
        ctx.stroke();
      }
    }
  }
  // にじみ
  for (let k = 0; k < 6; k++) {
    const x = b.x0 + r() * (b.x1 - b.x0);
    const y = b.y0 + r() * (b.y1 - b.y0);
    const rad = 8 + r() * 14;
    const gg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    gg.addColorStop(0, r() < 0.5 ? 'rgba(255, 240, 210, 0.12)' : 'rgba(60, 40, 20, 0.12)');
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.restore();
  // 縁の墨線（薄く）
  plotPath(ctx, i);
  ctx.strokeStyle = 'rgba(61, 48, 41, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/** 作物1株（足元 x, y）。stage 0 芽 / 1 若葉 / 2 育ち / 3 収穫どき */
function drawPlant(ctx: Ctx, crop: CropId, stage: number, x: number, y: number, stalled: boolean): void {
  const leaf = stalled ? '#a8a060' : '#6fae4c';
  const leafLight = stalled ? '#c8c088' : '#9ccf6a';
  const ink = 'rgba(52, 60, 30, 0.85)';
  const leafAt = (lx: number, ly: number, rx: number, ry: number, rot: number) => {
    ctx.beginPath();
    ctx.ellipse(lx, ly, rx, ry, rot, 0, Math.PI * 2);
    ctx.fillStyle = leaf;
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(lx - rx * 0.25, ly - ry * 0.3, rx * 0.45, ry * 0.4, rot, 0, Math.PI * 2);
    ctx.fillStyle = leafLight;
    ctx.fill();
  };
  ctx.lineCap = 'round';
  if (stage === 0) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 3);
    ctx.stroke();
    leafAt(x - 2.2, y - 4, 2.4, 1.3, -0.4);
    leafAt(x + 2.2, y - 4, 2.4, 1.3, 0.4);
    return;
  }
  const h = stage === 1 ? 9 : 15;
  ctx.strokeStyle = stalled ? '#7a7440' : '#4c7a30';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 1, y - h / 2, x, y - h);
  ctx.stroke();
  if (crop === 'bean') {
    for (let k = 3; k < h; k += 4) {
      const side = (k / 4) % 2 < 1 ? -1 : 1;
      leafAt(x + side * 3, y - k, 3.2, 2, side * 0.5);
    }
    if (stage === 3) {
      for (const [dx, dy] of [
        [-4, -7],
        [4, -11],
      ]) {
        ctx.beginPath();
        ctx.ellipse(x + dx, y + dy, 1.6, 3.6, 0.2, 0, Math.PI * 2);
        ctx.fillStyle = '#b8dc78';
        ctx.fill();
        ctx.strokeStyle = ink;
        ctx.stroke();
      }
    }
  } else {
    for (let k = 3; k < h; k += 4) {
      const side = (k / 4) % 2 < 1 ? -1 : 1;
      ctx.strokeStyle = leaf;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y - k);
      ctx.quadraticCurveTo(x + side * 3, y - k - 1, x + side * 5, y - k + 2);
      ctx.stroke();
    }
    if (stage >= 2) {
      const ripe = stage === 3;
      ctx.beginPath();
      ctx.ellipse(x, y - h - 3, 2, 4.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = ripe ? '#e8c060' : '#b8cc70';
      ctx.fill();
      ctx.strokeStyle = ripe ? 'rgba(120, 80, 20, 0.8)' : ink;
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
  }
}

function drawPlot(ctx: Ctx, i: number, p: Plot, items: Drawable[]): void {
  drawPlotGround(ctx, i, p);
  if (!p.crop) return;
  const r = PLOTS[i];
  const crop = p.crop;
  const stage = p.stage === 'ready' ? 3 : Math.min(2, Math.floor((p.growth / CROPS[crop].days) * 3));
  // 1区画に3列x3段で植える
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++) {
      const x = r.x0 + ((col + 0.5) * (r.x1 - r.x0)) / 3 + (row % 2) * 2;
      const y = r.y0 + ((row + 0.85) * (r.y1 - r.y0)) / 3;
      items.push({ y, x, draw: (c) => drawPlant(c, crop, stage, x, y, p.stalled) });
    }
}

// ---------------------------------------------------------------- 水の動き（村）

type Path = [number, number][];
/** 川の流れの中心線（上流から） */
const RIVER: Path = [
  [560, 440],
  [512, 536],
  [470, 610],
  [420, 690],
  [372, 770],
  [330, 842],
  [292, 910],
  [262, 972],
];
/** 橋の下からの滝 */
const FALLS: Path = [
  [236, 1096],
  [214, 1190],
  [196, 1290],
  [178, 1400],
];
/** 波打ち際（西から東） */
const SHORE: Path = [
  [372, 1462],
  [600, 1458],
  [800, 1452],
  [1000, 1450],
  [1200, 1446],
  [1400, 1434],
  [1600, 1416],
  [1750, 1396],
  [1850, 1368],
  [1960, 1330],
];

function pathLength(p: Path): number[] {
  const acc = [0];
  for (let i = 1; i < p.length; i++) acc.push(acc[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  return acc;
}

function pointOn(p: Path, acc: number[], d: number): { x: number; y: number; nx: number; ny: number } {
  const total = acc[acc.length - 1];
  d = Math.max(0, Math.min(total, d));
  let i = 1;
  while (i < acc.length - 1 && acc[i] < d) i++;
  const k = (d - acc[i - 1]) / (acc[i] - acc[i - 1] || 1);
  const dx = p[i][0] - p[i - 1][0];
  const dy = p[i][1] - p[i - 1][1];
  const len = Math.hypot(dx, dy) || 1;
  return { x: p[i - 1][0] + dx * k, y: p[i - 1][1] + dy * k, nx: -dy / len, ny: dx / len };
}

const RIVER_ACC = pathLength(RIVER);
const FALLS_ACC = pathLength(FALLS);
const SHORE_ACC = pathLength(SHORE);

function hash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 流れに沿って白い筋を流す */
function flowStreaks(ctx: Ctx, p: Path, acc: number[], t: number, n: number, speed: number, width: number, len: number, alpha: number, salt: number): void {
  const total = acc[acc.length - 1];
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const d = (hash(i + salt) * total + t * speed * (0.8 + hash(i + salt + 50) * 0.4)) % total;
    const off = (hash(i + salt + 100) - 0.5) * width;
    const a = pointOn(p, acc, d);
    const b = pointOn(p, acc, d + len);
    const life = Math.sin((d / total) * Math.PI);
    const tw = 0.6 + 0.4 * Math.sin(t * 3 + i);
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * life * tw})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(a.x + a.nx * off, a.y + a.ny * off);
    ctx.lineTo(b.x + b.nx * off, b.y + b.ny * off);
    ctx.stroke();
  }
}

function drawShore(ctx: Ctx, t: number, cam: Camera): void {
  const total = SHORE_ACC[SHORE_ACC.length - 1];
  // 波が寄せては返す（0〜1）
  const wave = (k: number) => 0.5 + 0.5 * Math.sin(t * 0.9 - k * 0.004);
  const line = (lift: (d: number) => number) => {
    ctx.beginPath();
    for (let d = 0; d <= total; d += 12) {
      const p = pointOn(SHORE, SHORE_ACC, d);
      const y = p.y - lift(d);
      if (d === 0) ctx.moveTo(p.x, y);
      else ctx.lineTo(p.x, y);
    }
  };
  if (cam.y + VIEW_H < 1300) return;
  // 濡れた砂（波が引いたあと）
  line((d) => 4 + 14 * wave(d));
  for (let d = total; d >= 0; d -= 12) {
    const p = pointOn(SHORE, SHORE_ACC, d);
    ctx.lineTo(p.x, p.y + 4);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(150, 120, 90, 0.16)';
  ctx.fill();
  // 寄せる波の白い泡
  line((d) => 2 + 12 * wave(d));
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.stroke();
  line((d) => -3 + 9 * wave(d + 300));
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // 海のきらめき
  for (let i = 0; i < 26; i++) {
    const d = hash(i + 7) * total;
    const p = pointOn(SHORE, SHORE_ACC, d);
    const y = p.y + 8 + hash(i + 70) * 30;
    const a = Math.max(0, Math.sin(t * 2.2 + i * 1.9));
    ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * a})`;
    ctx.fillRect(p.x + (hash(i + 3) - 0.5) * 20, y, 3, 1);
  }
}

function drawFountain(ctx: Ctx, t: number): void {
  const top = { x: 905, y: 750 };
  // 左右に落ちる水しぶき
  for (let i = 0; i < 26; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const k = (t * 0.9 + hash(i) ) % 1;
    const x = top.x + side * (6 + 34 * k);
    const y = top.y - 6 + 66 * k * k - 12 * k;
    ctx.fillStyle = `rgba(235, 248, 255, ${0.85 * (1 - k * 0.6)})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // 受け皿の波紋
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.5 + i / 3) % 1;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 * (1 - k)})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(905, 826, 10 + 30 * k, 3 + 8 * k, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // きらめき
  for (let i = 0; i < 5; i++) {
    const a = Math.max(0, Math.sin(t * 3 + i * 2.3));
    ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
    ctx.fillRect(885 + hash(i + 20) * 40, 815 + hash(i + 30) * 16, 2, 2);
  }
}

function drawWater(ctx: Ctx, t: number, cam: Camera): void {
  const near = (x0: number, y0: number, x1: number, y1: number) => x1 > cam.x && x0 < cam.x + VIEW_W && y1 > cam.y && y0 < cam.y + VIEW_H;
  if (near(150, 420, 600, 1000)) flowStreaks(ctx, RIVER, RIVER_ACC, t, 46, 38, 26, 14, 0.55, 0);
  if (near(80, 1080, 320, 1460)) {
    flowStreaks(ctx, FALLS, FALLS_ACC, t, 60, 110, 90, 22, 0.6, 500);
    // 滝つぼの泡
    for (let i = 0; i < 18; i++) {
      const k = (t * 0.7 + hash(i + 900)) % 1;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.6 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(130 + hash(i + 901) * 130, 1350 + hash(i + 902) * 60 - k * 10, 1.5 + k * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (near(840, 730, 970, 870)) drawFountain(ctx, t);
  drawShore(ctx, t, cam);
}

// ---------------------------------------------------------------- 人物

type Drawable = { y: number; x: number; draw: (ctx: Ctx) => void };

function companionDrawable(c: Companion, kind: 'moku' | 'momo', asleep: boolean, t: number): Drawable {
  // 飛べる2匹なので、起きているときはふわふわ浮く
  const float = asleep ? 0 : Math.sin(t * 4 + (kind === 'moku' ? 0 : 2)) * 2 - (kind === 'momo' ? 12 : 3);
  return {
    y: c.y,
    x: c.x,
    draw: (ctx) => {
      drawShadow(ctx, c.x, c.y, asleep ? 26 : 20);
      const frames = kind === 'moku' ? MOKU : MOMO;
      let def = asleep ? frames.sleep : frames.idle;
      if (!asleep && Math.floor(t * (kind === 'momo' ? 8 : 3)) % (kind === 'momo' ? 2 : 4) === 0) def = kind === 'moku' ? MOKU.hop : MOMO.flap;
      drawAtFeet(ctx, def, c.x, c.y + float + 1, c.dir === 'left');
      if (asleep) {
        const z = Math.floor(t * 1.5) % 3;
        ctx.globalAlpha = 0.85;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(spriteImage(ZZZ), c.x + 10 + z * 2, c.y - 46 - z * 5, 7, 7);
        ctx.imageSmoothingEnabled = true;
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

function vignette(ctx: Ctx): void {
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.62);
  g.addColorStop(0, 'rgba(10, 8, 24, 0)');
  g.addColorStop(1, 'rgba(10, 8, 24, 0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

// ---------------------------------------------------------------- 本体

export function drawWorld(ctx: Ctx, s: GameState, anim: PlayerAnim, t: number, clock = s.clock): Camera {
  const area = s.player.area;
  const a = areaArt(area);
  const cam = cameraFor(s);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  if (a?.ready) ctx.drawImage(a.img, cam.x, cam.y, VIEW_W, VIEW_H, cam.x, cam.y, VIEW_W, VIEW_H);
  else if (area === 'village') {
    ctx.fillStyle = '#9cbf6a';
    ctx.fillRect(cam.x, cam.y, VIEW_W, VIEW_H);
  } else ctx.drawImage(interiorImage(area), 0, 0, 800, 450);

  const items: Drawable[] = [];
  if (area === 'village') {
    drawWater(ctx, t, cam);
    s.plots.forEach((p, i) => drawPlot(ctx, i, p, items));
    for (const c of cows) items.push(cowDrawable(c, t));
  }

  // 仲間（同じエリアにいるときだけ）
  const moku = s.companions.moku;
  if (moku.met && moku.area === area) items.push(companionDrawable(moku, 'moku', mokuAsleep(clock), t));
  const momo = s.companions.momo;
  if (momo.met && momo.area === area) items.push(companionDrawable(momo, 'momo', momoAsleep(clock), t));

  // 主人公
  const p = s.player;
  const facing = p.dir === 'left' || p.dir === 'right' ? 'side' : p.dir;
  const step = anim.moving ? Math.floor(anim.walked / 11) % 4 : 0;
  items.push({
    y: p.y,
    x: p.x,
    draw: (c) => {
      drawShadow(c, p.x, p.y, 30);
      drawAtFeet(c, PLAYER[facing][step], p.x, p.y + 2, p.dir === 'left');
    },
  });

  // 手前に来る絵（建物・木・噴水）。奥にいる人物が境目に近いほど薄くして、切り替わりをなめらかにする
  const chars = items.slice();
  for (const co of a?.cutouts ?? []) {
    let alpha = 1;
    for (const ch of chars) {
      if (ch.x < co.x0 - 16 || ch.x > co.x1 + 16 || ch.y >= co.baseY) continue;
      alpha = Math.min(alpha, Math.min(1, (co.baseY - ch.y) / 14));
    }
    items.push({
      y: co.baseY,
      x: (co.x0 + co.x1) / 2,
      draw: (g) => {
        g.globalAlpha = alpha;
        g.drawImage(co.img, co.x0, co.y0);
        g.globalAlpha = 1;
      },
    });
  }

  items.sort((a1, b1) => a1.y - b1.y);
  for (const it of items) it.draw(ctx);

  // ---- 光
  const hour = hourFloat(clock);
  const forgeBusy = s.forge.queue.length > 0 || s.forge.ready > 0;
  const dark = darkness(hour);
  if (area === 'village') {
    const [r, g, b] = skyColor(hour);
    if (r + g + b < 765) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(cam.x, cam.y, VIEW_W, VIEW_H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (dark > 0.15) {
      ctx.globalCompositeOperation = 'lighter';
      for (const w of WINDOWS.hut) {
        glow(ctx, w.x, w.y, 10, 'rgba(255, 210, 120, A)', 0.8 * dark);
        glow(ctx, w.x, w.y + 14, 46, 'rgba(255, 170, 80, A)', 0.3 * dark);
      }
      glow(ctx, WINDOWS.forge.x, WINDOWS.forge.y, forgeBusy ? 14 : 8, 'rgba(255, 140, 60, A)', (forgeBusy ? 0.9 : 0.5) * dark);
      glow(ctx, WINDOWS.forge.x, WINDOWS.forge.y + 20, forgeBusy ? 70 : 36, 'rgba(255, 110, 40, A)', (forgeBusy ? 0.4 : 0.18) * dark);
      // ホタル（広場と川べり）
      for (let i = 0; i < 40; i++) {
        const fx = 400 + ((i * 397) % 1300) + Math.sin(t * 0.7 + i) * 30;
        const fy = 680 + ((i * 211) % 520) + Math.cos(t * 0.5 + i * 2) * 20;
        const blink = (Math.sin(t * 2 + i * 1.7) + 1) / 2;
        if (fx < cam.x - 8 || fy < cam.y - 8 || fx > cam.x + VIEW_W + 8 || fy > cam.y + VIEW_H + 8) continue;
        glow(ctx, fx, fy, 8, 'rgba(210, 255, 140, A)', 0.5 * blink * dark);
        ctx.fillStyle = `rgba(240, 255, 200, ${blink * dark})`;
        ctx.fillRect(fx, fy, 1.2, 1.2);
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (forgeBusy) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, WINDOWS.forge.x, WINDOWS.forge.y, 10, 'rgba(255, 120, 50, A)', 0.35 + 0.1 * Math.sin(t * 6));
      ctx.globalCompositeOperation = 'source-over';
    }
  } else {
    // 室内：夜は暗く、ろうそくや炉の明かりが灯る
    if (dark > 0.05) {
      ctx.globalCompositeOperation = 'multiply';
      const k = 1 - 0.45 * dark;
      ctx.fillStyle = `rgb(${Math.round(255 * k)}, ${Math.round(235 * k)}, ${Math.round(220 * k)})`;
      ctx.fillRect(0, 0, 800, 450);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalCompositeOperation = 'lighter';
    if (area === 'hut') glow(ctx, 505, 228, 70, 'rgba(255, 190, 110, A)', 0.15 + 0.3 * dark + 0.03 * Math.sin(t * 9));
    if (area === 'smithy') {
      const f = forgeBusy ? 0.55 + 0.08 * Math.sin(t * 7) : 0.12;
      glow(ctx, SMITHY_FIRE.x, SMITHY_FIRE.y, forgeBusy ? 120 : 50, 'rgba(255, 120, 40, A)', f);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  vignette(ctx);
  return cam;
}
