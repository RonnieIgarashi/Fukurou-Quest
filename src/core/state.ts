// ゲームの状態。セーブデータにはこの形がそのまま入る（DOM に依存しない）。
import { START_TIME } from './clock.js';
import { AreaId, HOME, PLOTS } from './map.js';
import { CropId, GoodsId, START_INVENTORY } from './params.js';

export type ManaId = 'white' | 'earth' | 'water' | 'fire' | 'wind';
export const MANA_IDS: ManaId[] = ['white', 'earth', 'water', 'fire', 'wind'];
export const MANA_NAMES: Record<ManaId, string> = {
  white: '白',
  earth: '地',
  water: '水',
  fire: '火',
  wind: '風',
};
/** 【確定】畑が使うマナは地・火・風の3つ（水は本物の水をやる。水のマナ・白のマナは使わない。2026-11-19 Ronnie） */
export const FARM_MANA: ManaId[] = ['earth', 'fire', 'wind'];

export type Dir = 'down' | 'up' | 'left' | 'right';

export type PlotStage = 'wild' | 'tilled' | 'growing' | 'ready';

/** 畑の1区画。位置は map.ts の PLOTS[番号] */
export interface Plot {
  stage: PlotStage;
  crop: CropId | null;
  /** 育った日数 */
  growth: number;
  /** 直近の朝にマナが無く生育が止まったか */
  stalled: boolean;
  /** 畑にあげてあるマナ（地・火・風を1つずつ）。育った朝に使い切る。水と違って、育つまで土に残る */
  fed: boolean;
  /** 今日やった水（朝の生育で使い、朝にまた none に戻る） */
  watered: 'none' | 'river' | 'pure';
  /** 直近の朝に水が足りず生育が止まったか */
  dry: boolean;
  /** きれいな水で育った日数（収量が増える） */
  pureDays: number;
}

export interface Companion {
  met: boolean;
  /** いるエリア */
  area: AreaId;
  x: number;
  y: number;
  dir: Dir;
}

export interface GameState {
  playerName: string;
  /** 1日目 0:00 からの通算分 */
  clock: number;
  /** いるエリアと、その絵の座標（px）。y は足元 */
  player: { area: AreaId; x: number; y: number; dir: Dir };
  inv: {
    seeds: Record<CropId, number>;
    crops: Record<CropId, number>;
    mana: Record<ManaId, number>;
    goods: Record<GoodsId, number>;
  };
  plots: Plot[];
  /** 水。carried は持ち歩いている水（水やり1回ぶんが1杯）、barrelPure は水くみ場の樽の浄化した水（飲む1回ぶんが1） */
  water: { carried: { river: number; pure: number }; barrelPure: number };
  /** からだの具合（0〜100。大きいほど渇いて・空いている） */
  body: { thirst: number; hunger: number };
  /** 炉。queue は変化中の白のマナ1つずつの残り分、ready は取り出せる火のマナ */
  forge: { queue: number[]; ready: number };
  companions: { moku: Companion; momo: Companion };
  /** 物語の進行フラグ（イベント済みなど） */
  flags: Record<string, boolean>;
  /** 通算のプレイ時間（実時間の秒）。セーブ一覧の表示用 */
  playSeconds: number;
}

export function newPlot(): Plot {
  return { stage: 'wild', crop: null, growth: 0, stalled: false, fed: false, watered: 'none', dry: false, pureDays: 0 };
}

export function createGame(playerName: string): GameState {
  return {
    playerName,
    clock: START_TIME,
    player: { area: 'village', x: HOME.x, y: HOME.y, dir: 'down' },
    inv: {
      seeds: { ...START_INVENTORY.seeds },
      crops: { ...START_INVENTORY.crops },
      mana: { ...START_INVENTORY.mana },
      goods: { ...START_INVENTORY.goods },
    },
    plots: PLOTS.map(newPlot),
    water: { carried: { river: 0, pure: 0 }, barrelPure: 0 },
    body: { thirst: 0, hunger: 0 },
    forge: { queue: [], ready: 0 },
    companions: {
      moku: { met: true, area: 'village', x: HOME.x + 34, y: HOME.y + 4, dir: 'down' },
      momo: { met: false, area: 'village', x: HOME.x - 34, y: HOME.y + 4, dir: 'down' },
    },
    flags: {},
    playSeconds: 0,
  };
}
