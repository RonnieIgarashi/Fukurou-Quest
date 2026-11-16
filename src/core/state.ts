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
/** 【確定】畑が使う4属性 */
export const FARM_MANA: ManaId[] = ['earth', 'water', 'fire', 'wind'];

export type Dir = 'down' | 'up' | 'left' | 'right';

export type PlotStage = 'wild' | 'tilled' | 'growing' | 'ready';

/** 畑の1区画。位置は map.ts の PLOTS[番号] */
export interface Plot {
  stage: PlotStage;
  crop: CropId | null;
  /** 育った日数 */
  growth: number;
  /** 直近の朝にマナが足りず生育が止まったか */
  stalled: boolean;
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
  /** 炉。queue は変化中の白のマナ1つずつの残り分、ready は取り出せる火のマナ */
  forge: { queue: number[]; ready: number };
  companions: { moku: Companion; momo: Companion };
  /** 物語の進行フラグ（イベント済みなど） */
  flags: Record<string, boolean>;
  /** 通算のプレイ時間（実時間の秒）。セーブ一覧の表示用 */
  playSeconds: number;
}

export function newPlot(): Plot {
  return { stage: 'wild', crop: null, growth: 0, stalled: false };
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
    forge: { queue: [], ready: 0 },
    companions: {
      moku: { met: true, area: 'village', x: HOME.x + 34, y: HOME.y + 4, dir: 'down' },
      momo: { met: false, area: 'village', x: HOME.x - 34, y: HOME.y + 4, dir: 'down' },
    },
    flags: {},
    playSeconds: 0,
  };
}
