// 粒（パーティクル）で出す、水しぶき・もや・煙・火の粉（2026-11-16 Ronnie「水と煙はパーティクルをリアルに」）。
// 1粒ずつ位置・速さ・寿命を持ち、毎フレーム動かして、だんだん薄く・大きく（煙）したり、落ちて消えたり（水）する。
import { Ctx, makeCanvas, rng } from './gfx.js';

export type Kind = 'puff' | 'drop' | 'mist' | 'foam' | 'spark';

export interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 加速度（重力・風） */
  ax: number;
  ay: number;
  /** 空気の抵抗（1秒あたりに速さが減る割合） */
  drag: number;
  age: number;
  life: number;
  /** 大きさ（半径）。grow で1秒ごとに大きくなる */
  size: number;
  grow: number;
  rot: number;
  vrot: number;
  alpha: number;
  /** この高さまで落ちたら消える（水滴）。消えるときに onLand を呼ぶ */
  floorY?: number;
  onLand?: (p: Particle) => void;
  /** 煙の見本の番号 */
  look: number;
}

const R = rng(9090);
export const rand = (a = 0, b = 1): number => a + R() * (b - a);

// ---------------------------------------------------------------- 煙・もやの見本（ふわっとした、形の崩れた丸）

const PUFF_SIZE = 64;
const puffs: { light: HTMLCanvasElement; dark: HTMLCanvasElement }[] = [];

function makePuff(seed: number, color: [number, number, number]): HTMLCanvasElement {
  const r = rng(seed);
  const [c, ctx] = makeCanvas(PUFF_SIZE, PUFF_SIZE);
  const h = PUFF_SIZE / 2;
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 11;
    const x = h + Math.cos(a) * d;
    const y = h + Math.sin(a) * d * 0.8;
    const rad = 10 + r() * 12;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const [cr, cg, cb] = color;
    g.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.6)`);
    g.addColorStop(0.55, `rgba(${cr}, ${cg}, ${cb}, 0.32)`);
    g.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, PUFF_SIZE, PUFF_SIZE);
  }
  // 水彩の紙のざらつき
  const img = ctx.getImageData(0, 0, PUFF_SIZE, PUFF_SIZE);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = Math.max(0, img.data[i] * (0.82 + r() * 0.3));
  ctx.putImageData(img, 0, 0);
  return c;
}

function puff(i: number): { light: HTMLCanvasElement; dark: HTMLCanvasElement } {
  if (!puffs.length) {
    for (let k = 0; k < 4; k++) puffs.push({ light: makePuff(70 + k, [246, 244, 240]), dark: makePuff(70 + k, [120, 116, 118]) });
  }
  return puffs[i % puffs.length];
}

// ---------------------------------------------------------------- 粒の集まり

export class Particles {
  list: Particle[] = [];
  constructor(private readonly max = 400) {}

  add(p: Partial<Particle> & Pick<Particle, 'kind' | 'x' | 'y' | 'life'>): void {
    if (this.list.length >= this.max) return;
    this.list.push({
      vx: 0,
      vy: 0,
      ax: 0,
      ay: 0,
      drag: 0,
      age: 0,
      size: 1,
      grow: 0,
      rot: rand(0, Math.PI * 2),
      vrot: 0,
      alpha: 1,
      look: Math.floor(rand(0, 4)),
      ...p,
    });
  }

  clear(): void {
    this.list = [];
  }

  update(dt: number): void {
    const next: Particle[] = [];
    for (const p of this.list) {
      p.age += dt;
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      p.rot += p.vrot * dt;
      if (p.floorY !== undefined && p.vy > 0 && p.y >= p.floorY) {
        p.onLand?.(p);
        continue;
      }
      if (p.age < p.life) next.push(p);
    }
    this.list = next;
  }

  draw(ctx: Ctx): void {
    for (const p of this.list) {
      const k = p.age / p.life;
      // 出てすぐはふわっと現れ、終わりに向けて薄くなる
      const fade = Math.min(1, p.age * 4) * (p.kind === 'puff' ? 1 - k : (1 - k) * (1 - k));
      switch (p.kind) {
        case 'puff':
        case 'mist': {
          const s = puff(p.look);
          const size = p.size * 2;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          // 煙は出たてが少し濃い灰色で、上るにつれて白く薄くなる
          if (p.kind === 'puff') {
            ctx.globalAlpha = p.alpha * fade * Math.max(0, 0.7 - k);
            ctx.drawImage(s.dark, -size / 2, -size / 2, size, size);
          }
          ctx.globalAlpha = p.alpha * fade;
          ctx.drawImage(s.light, -size / 2, -size / 2, size, size);
          ctx.restore();
          break;
        }
        case 'drop': {
          // 速さの向きに少し伸びた水滴
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const len = Math.min(5, sp * 0.03);
          ctx.strokeStyle = `rgba(236, 248, 255, ${p.alpha * (1 - k * 0.5)})`;
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len);
          ctx.stroke();
          break;
        }
        case 'foam': {
          ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha * (1 - k)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'spark': {
          const a = p.alpha * (1 - k);
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
          g.addColorStop(0, `rgba(255, 230, 150, ${a})`);
          g.addColorStop(0.3, `rgba(255, 140, 50, ${a * 0.6})`);
          g.addColorStop(1, 'rgba(255, 90, 20, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(p.x - p.size * 3, p.y - p.size * 3, p.size * 6, p.size * 6);
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- よく使う出し方

/** 一定の割合（1秒あたり rate 個）で出すための、端数の持ち越し */
export class Emitter {
  private acc = 0;
  constructor(public rate: number) {}
  /** この dt で出す個数 */
  count(dt: number): number {
    this.acc += this.rate * dt;
    const n = Math.floor(this.acc);
    this.acc -= n;
    return n;
  }
}

/** 煙突の煙 */
export function smoke(ps: Particles, x: number, y: number, strength = 1): void {
  ps.add({
    kind: 'puff',
    x: x + rand(-2, 2),
    y,
    vx: rand(1, 4),
    vy: rand(-24, -17),
    // 上るほど風に流される
    ax: rand(3, 5),
    ay: 1,
    drag: 0.1,
    life: rand(6, 8.5),
    size: rand(4, 6),
    grow: rand(4, 5.5),
    vrot: rand(-0.3, 0.3),
    alpha: 0.95 * strength,
  });
}
