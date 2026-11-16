// ゲームの状態。セーブデータにはこの形がそのまま入る（DOM に依存しない）。
import { START_TIME } from './clock.js';
import { DOOR, plotTiles, TILE } from './map.js';
import { CropId, START_INVENTORY } from './params.js';

export type ManaId = 'white' | 'earth' | 'water' | 'fire' | 'wind';
export const MANA_IDS: ManaId[] = ['white', 'earth', 'water', 'fire', 'wind'];
export const MANA_NAMES: Record<ManaId, string> = {
  white: '白',
  earth: '地',
  water: '水',
  fire: '火',
  wind: '風',
};
/** 【確定】畑が使う4属性 */
export const FARM_MANA: ManaId[] = ['earth', 'water', 'fire', 'wind'];

export type Dir = 'down' | 'up' | 'left' | 'right';

export type PlotStage = 'wild' | 'tilled' | 'growing' | 'ready';

export interface Plot {
  tx: number;
  ty: number;
  stage: PlotStage;
  crop: CropId | null;
  /** 育った日数 */
  growth: number;
  /** 直近の朝にマナが足りず生育が止まったか */
  stalled: boolean;
}

export interface Companion {
  met: boolean;
  x: number;
  y: number;
  dir: Dir;
}

export interface GameState {
  playerName: string;
  /** 1日目 0:00 からの通算分 */
  clock: number;
  player: { x: number; y: number; dir: Dir };
  inv: {
    seeds: Record<CropId, number>;
    crops: Record<CropId, number>;
    mana: Record<ManaId, number>;
  };
  plots: Plot[];
  /** 炉。queue は変化中の白のマナ1つずつの残り分、ready は取り出せる火のマナ */
  forge: { queue: number[]; ready: number };
  companions: { moku: Companion; momo: Companion };
  /** 物語の進行フラグ（イベント済みなど） */
  flags: Record<string, boolean>;
  /** 通算のプレイ時間（実時間の秒）。セーブ一覧の表示用 */
  playSeconds: number;
}

/** タイルの中心（足元）の座標 */
export function tileCenter(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE - 3 };
}

export function createGame(playerName: string): GameState {
  const start = tileCenter(DOOR.tx, DOOR.ty + 1);
  return {
    playerName,
    clock: START_TIME,
    player: { x: start.x, y: start.y, dir: 'down' },
    inv: {
      seeds: { ...START_INVENTORY.seeds },
      crops: { ...START_INVENTORY.crops },
      mana: { ...START_INVENTORY.mana },
    },
    plots: plotTiles().map((p) => ({ tx: p.tx, ty: p.ty, stage: 'wild', crop: null, growth: 0, stalled: false })),
    forge: { queue: [], ready: 0 },
    companions: {
      moku: { met: true, x: start.x + 18, y: start.y + 2, dir: 'down' },
      momo: { met: false, x: start.x - 18, y: start.y + 2, dir: 'down' },
    },
    flags: {},
    playSeconds: 0,
  };
}
