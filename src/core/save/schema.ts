// セーブデータの形の版と、読み込み時の検証・変換。
import { dayOf } from '../clock.js';
import { createGame, GameState } from '../state.js';
import { SaveFile, SaveSummary } from './store.js';

export const SAVE_SCHEMA = 1;

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
    player: { ...base.player, ...(g.player ?? {}) },
    inv: {
      seeds: { ...base.inv.seeds, ...(g.inv?.seeds ?? {}) },
      crops: { ...base.inv.crops, ...(g.inv?.crops ?? {}) },
      mana: { ...base.inv.mana, ...(g.inv?.mana ?? {}) },
    },
    plots: Array.isArray(g.plots) && g.plots.length === base.plots.length ? g.plots : base.plots,
    forge: { ...base.forge, ...(g.forge ?? {}) },
    companions: {
      moku: { ...base.companions.moku, ...(g.companions?.moku ?? {}) },
      momo: { ...base.companions.momo, ...(g.companions?.momo ?? {}) },
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
