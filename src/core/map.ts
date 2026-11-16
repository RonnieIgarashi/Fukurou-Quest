// 村エリアの地形。タイル単位（16px）で持ち、表示とは切り離す。
// 配置はプロトタイプ用の【仮】。正式なマップ形状・エリア間の接続は未決定。

export const TILE = 16;
export const MAP_W = 40;
export const MAP_H = 28;

export type Tile =
  | 'grass'
  | 'flower'
  | 'path'
  | 'water'
  | 'sand'
  | 'tree'
  | 'hut'
  | 'forge'
  | 'soil'
  | 'rock'
  | 'sign'
  | 'bridge';

export type SpotKind = 'door' | 'forge' | 'plot' | 'sign';

export interface Spot {
  kind: SpotKind;
  tx: number;
  ty: number;
  /** plot のときの畑の番号 */
  plot?: number;
}

/** 小屋（3x3タイル）。扉は下の段の真ん中 */
export const HUT = { tx: 17, ty: 5, w: 3, h: 3 } as const;
export const DOOR = { tx: HUT.tx + 1, ty: HUT.ty + HUT.h - 1 } as const;
/** 炉（2x2タイル） */
export const FORGE_AT = { tx: 21, ty: 6, w: 2, h: 2 } as const;
/** 畑（3x2区画） */
export const FIELD = { tx: 24, ty: 10, w: 3, h: 2 } as const;
/** 村の外れの立て札 */
export const SIGN_AT = { tx: 37, ty: 14 } as const;

/** 位置から決まる 0〜1 の乱数（毎回同じ値になる） */
export function tileHash(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function build(): Tile[][] {
  const t: Tile[][] = [];
  for (let y = 0; y < MAP_H; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < MAP_W; x++) row.push(tileHash(x, y, 1) < 0.08 ? 'flower' : 'grass');
    t.push(row);
  }
  const set = (x: number, y: number, v: Tile) => {
    if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) t[y][x] = v;
  };

  // 西を流れる川（砂の岸つき）。少し蛇行させる
  for (let y = 0; y < MAP_H; y++) {
    const cx = 5 + Math.round(Math.sin(y / 4) * 1.2);
    for (let x = cx - 1; x <= cx + 1; x++) set(x, y, 'water');
    set(cx - 2, y, 'sand');
    set(cx + 2, y, 'sand');
  }

  // 外周の木（東の出口だけ空ける）
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const edge = y < 2 || y >= MAP_H - 2 || x >= MAP_W - 2;
      if (edge && t[y][x] !== 'water' && t[y][x] !== 'sand') set(x, y, 'tree');
    }
  }

  // 小屋から南へ、そこから東の出口へ続く道
  for (let y = DOOR.ty + 1; y <= 14; y++) set(DOOR.tx, y, 'path');
  for (let x = DOOR.tx; x < MAP_W; x++) set(x, 14, 'path');
  // 西の川へ向かう小道と橋
  for (let x = 8; x < DOOR.tx; x++) set(x, 14, 'path');
  for (let x = 3; x <= 8; x++) {
    const tile = t[14][x];
    if (tile === 'water') set(x, 14, 'bridge');
    else if (tile === 'sand' || tile === 'grass' || tile === 'flower') set(x, 14, 'path');
  }
  // 畑への小道
  for (let x = DOOR.tx + 1; x < FIELD.tx; x++) set(x, 12, 'path');
  for (let y = 12; y <= 14; y++) set(DOOR.tx + 1, y, 'path');

  // 小屋・炉・畑
  for (let y = 0; y < HUT.h; y++) for (let x = 0; x < HUT.w; x++) set(HUT.tx + x, HUT.ty + y, 'hut');
  for (let y = 0; y < FORGE_AT.h; y++) for (let x = 0; x < FORGE_AT.w; x++) set(FORGE_AT.tx + x, FORGE_AT.ty + y, 'forge');
  for (let y = 0; y < FIELD.h; y++) for (let x = 0; x < FIELD.w; x++) set(FIELD.tx + x, FIELD.ty + y, 'soil');

  // 村のあちこちの木と岩（建物・道・畑のまわりは避ける）
  for (let y = 2; y < MAP_H - 2; y++) {
    for (let x = 9; x < MAP_W - 2; x++) {
      if (t[y][x] !== 'grass' && t[y][x] !== 'flower') continue;
      const nearBuild = x >= HUT.tx - 2 && x <= FIELD.tx + FIELD.w + 1 && y >= HUT.ty - 1 && y <= 15;
      if (nearBuild) continue;
      const r = tileHash(x, y, 7);
      if (r < 0.06) set(x, y, 'tree');
      else if (r < 0.075) set(x, y, 'rock');
    }
  }
  // 出口まわりは開けておく
  for (let y = 12; y <= 16; y++) for (let x = MAP_W - 4; x < MAP_W; x++) if (t[y][x] !== 'path') set(x, y, 'grass');
  set(SIGN_AT.tx, SIGN_AT.ty - 1, 'sign');
  return t;
}

export const TILES: Tile[][] = build();

const BLOCKED: ReadonlySet<Tile> = new Set<Tile>(['water', 'tree', 'hut', 'forge', 'rock', 'sign']);

export function tileAt(tx: number, ty: number): Tile {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return 'tree';
  return TILES[ty][tx];
}

export function isBlocked(tx: number, ty: number): boolean {
  if (tx >= MAP_W) return true; // 東の出口の先（森）はプロトタイプでは行けない
  return BLOCKED.has(tileAt(tx, ty));
}

/** 畑の区画の位置（番号順） */
export function plotTiles(): { tx: number; ty: number }[] {
  const out: { tx: number; ty: number }[] = [];
  for (let y = 0; y < FIELD.h; y++) for (let x = 0; x < FIELD.w; x++) out.push({ tx: FIELD.tx + x, ty: FIELD.ty + y });
  return out;
}

/** そのタイルで調べられるもの */
export function spotAt(tx: number, ty: number): Spot | null {
  if (tx === DOOR.tx && ty === DOOR.ty) return { kind: 'door', tx, ty };
  const tile = tileAt(tx, ty);
  if (tile === 'forge') return { kind: 'forge', tx, ty };
  if (tile === 'sign') return { kind: 'sign', tx, ty };
  if (tile === 'soil') {
    const plot = plotTiles().findIndex((p) => p.tx === tx && p.ty === ty);
    if (plot >= 0) return { kind: 'plot', tx, ty, plot };
  }
  return null;
}
