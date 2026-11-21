// 村で拾える物と、リンゴの木（2026-11-21 Ronnie）。
// - 浜辺：水のマナと魚、荒野の入り口：地のマナ、西の橋の先（村の左端）：風のマナ が、ときどき落ちている
// - 畑の奥のリンゴの木：実をもいで収穫できる。毎朝いくつか実る
// 落ちる場所・時刻は日付から決まる（乱数を使わない。一度に進めても1分ずつ進めても同じになるように）。
import { APPLES, footFree, Poly, inPoly } from './map.js';
import { FORAGE } from './params.js';
import type { GameState } from './state.js';

export type PickupKind = 'mana:water' | 'mana:earth' | 'mana:wind' | 'fish';

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
}

export const PICKUP_NAMES: Record<PickupKind, string> = {
  'mana:water': '水のマナ',
  'mana:earth': '地のマナ',
  'mana:wind': '風のマナ',
  fish: '魚',
};

const rect = (x0: number, y0: number, x1: number, y1: number): Poly => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** 落ちる場所（村）。この中の、立てる所に落ちる */
export const FORAGE_ZONES: Record<string, { poly: Poly; kinds: PickupKind[] }> = {
  shore: { poly: rect(430, 1360, 1640, 1432), kinds: ['mana:water', 'fish'] },
  wasteland: { poly: rect(1700, 760, 1845, 875), kinds: ['mana:earth'] },
  westEdge: { poly: rect(28, 1020, 135, 1090), kinds: ['mana:wind'] },
};

/** 0〜1 の決まった値（日付・回・番号から） */
function hash(...n: number[]): number {
  let x = 0;
  for (const v of n) x = Math.sin(x * 12.9898 + v * 78.233 + 0.5) * 43758.5453;
  return x - Math.floor(x);
}

function spotIn(poly: Poly, seed: number[]): { x: number; y: number } | null {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let k = 0; k < 40; k++) {
    const x = Math.round(x0 + hash(...seed, k, 1) * (x1 - x0));
    const y = Math.round(y0 + hash(...seed, k, 2) * (y1 - y0));
    if (inPoly(x, y, poly) && footFree('village', x, y)) return { x, y };
  }
  return null;
}

/**
 * 落とし物を置く（朝と昼に呼ぶ。slot は 0＝朝・1＝昼）。
 * 1日に落ちる数は FORAGE.PER_DAY（朝と昼に分けて）。拾わずにいても、種類ごとに FORAGE.MAX_ON_GROUND までしかたまらない
 */
export function dropPickups(s: GameState, day: number, slot: 0 | 1): void {
  let n = 0;
  for (const [zi, zone] of Object.values(FORAGE_ZONES).entries()) {
    for (const [ki, kind] of zone.kinds.entries()) {
      const perDay = FORAGE.PER_DAY[kind];
      // 朝に半分（端数は日によって朝か昼か）、昼に残り
      const morning = Math.floor(perDay / 2) + (perDay % 2 && hash(day, zi, ki, 9) < 0.5 ? 1 : 0);
      const count = slot === 0 ? morning : perDay - morning;
      for (let i = 0; i < count; i++) {
        if (s.pickups.filter((p) => p.kind === kind).length >= FORAGE.MAX_ON_GROUND) break;
        const at = spotIn(zone.poly, [day, slot, zi, ki, i, n++]);
        if (at) s.pickups.push({ kind, ...at });
      }
    }
  }
}

/** (x, y) の近くに落ちている物の番号（無ければ -1） */
export function pickupAt(s: GameState, x: number, y: number, r: number = FORAGE.REACH): number {
  if (s.player.area !== 'village') return -1;
  let best = -1;
  let bd: number = r;
  s.pickups.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** 拾う。拾った物の知らせを返す */
export function takePickup(s: GameState, i: number): string | null {
  const p = s.pickups[i];
  if (!p) return null;
  s.pickups.splice(i, 1);
  if (p.kind === 'fish') s.inv.goods.fish++;
  else s.inv.mana[p.kind.slice(5) as 'water' | 'earth' | 'wind']++;
  return `${PICKUP_NAMES[p.kind]}を拾った！`;
}

// ---------------------------------------------------------------- リンゴの木

/** 毎朝、もがれた所に実がなる（決まった数まで） */
export function growApples(s: GameState, day: number): void {
  const empty = s.apples.map((on, i) => (on ? -1 : i)).filter((i) => i >= 0);
  empty.sort((a, b) => hash(day, a, 7) - hash(day, b, 7));
  for (const i of empty.slice(0, FORAGE.APPLES_PER_DAY)) s.apples[i] = true;
}

export function applesOnTree(s: GameState): number {
  return s.apples.filter(Boolean).length;
}

/** 実を1つもぐ（いちばん低い所から） */
export function pickApple(s: GameState): boolean {
  const order = APPLES.map((a, i) => i).sort((a, b) => APPLES[b].y - APPLES[a].y);
  const i = order.find((k) => s.apples[k]);
  if (i === undefined) return false;
  s.apples[i] = false;
  s.inv.goods.apple++;
  return true;
}
