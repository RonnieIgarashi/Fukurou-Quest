// セーブデータの形の版と、読み込み時の検証・変換。
import { dayOf } from '../clock.js';
import { createGame, GameState } from '../state.js';
import { SaveFile, SaveSummary } from './store.js';

/**
 * 1→2：村が一枚絵になり、座標が変わった（畑の番号と中身はそのまま）
 * 2→3：エリア（村・小屋の中・鍛冶小屋の中）を持つようになった。無ければ村
 * 3→4：水（持っている水・樽の浄化した水）・からだの具合・畑の水やりを持つようになった。無ければ初期値
 * 4→5：畑のマナは朝に勝手に使わず、畑で自分であげる（fed）ようになった。無ければ「まだあげていない」
 */
export const SAVE_SCHEMA = 5;

export function newSaveFile(slotId: string, game: GameState, now: Date, ownerId: string | null = null): SaveFile {
  const iso = now.toISOString();
  return { schema: SAVE_SCHEMA, slotId, ownerId, createdAt: iso, updatedAt: iso, game };
}

export function summarize(f: SaveFile): SaveSummary {
  return {
    slotId: f.slotId,
    playerName: f.game.playerName,
    day: dayOf(f.game.clock),
    clock: f.game.clock,
    updatedAt: f.updatedAt,
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 保存されていた JSON を今の形に直す。壊れていれば null。
 * 足りない項目は新規ゲームの初期値で埋める（版を上げずに項目を足したときの保険）。
 */
export function migrate(raw: unknown): SaveFile | null {
  if (!isObject(raw) || !isObject(raw.game)) return null;
  const schema = typeof raw.schema === 'number' ? raw.schema : 0;
  if (schema > SAVE_SCHEMA) return null; // 新しい版で作られたデータは読まない
  const g = raw.game as Partial<GameState>;
  if (typeof g.playerName !== 'string' || typeof g.clock !== 'number') return null;
  const base = createGame(g.playerName);
  const game: GameState = {
    ...base,
    ...g,
    // 版1は座標の体系が違うので、位置は小屋の前に戻す
    player: schema < 2 ? base.player : { ...base.player, ...(g.player ?? {}) },
    inv: {
      seeds: { ...base.inv.seeds, ...(g.inv?.seeds ?? {}) },
      crops: { ...base.inv.crops, ...(g.inv?.crops ?? {}) },
      mana: { ...base.inv.mana, ...(g.inv?.mana ?? {}) },
      goods: { ...base.inv.goods, ...(g.inv?.goods ?? {}) },
    },
    plots:
      Array.isArray(g.plots) && g.plots.length === base.plots.length
        ? g.plots.map((p) => ({
            stage: p.stage,
            crop: p.crop,
            growth: p.growth,
            stalled: p.stalled,
            fed: p.fed === true,
            watered: p.watered === 'pure' || p.watered === 'river' ? p.watered : 'none',
            dry: p.dry === true,
            pureDays: typeof p.pureDays === 'number' ? p.pureDays : 0,
          }))
        : base.plots,
    water: {
      carried: { ...base.water.carried, ...(g.water?.carried ?? {}) },
      barrelPure: typeof g.water?.barrelPure === 'number' ? g.water.barrelPure : base.water.barrelPure,
    },
    body: { ...base.body, ...(g.body ?? {}) },
    forge: { ...base.forge, ...(g.forge ?? {}) },
    companions: {
      moku: { ...base.companions.moku, ...(g.companions?.moku ?? {}), ...(schema < 2 ? { x: base.companions.moku.x, y: base.companions.moku.y } : {}) },
      momo: { ...base.companions.momo, ...(g.companions?.momo ?? {}), ...(schema < 2 ? { x: base.companions.momo.x, y: base.companions.momo.y } : {}) },
    },
    flags: { ...(g.flags ?? {}) },
  };
  const now = new Date(0).toISOString();
  return {
    schema: SAVE_SCHEMA,
    slotId: typeof raw.slotId === 'string' ? raw.slotId : 'slot1',
    ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    game,
  };
}
