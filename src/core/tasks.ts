// タスク（行動）。実行すると効果を反映し、所要時間ぶん advance() で時間をまとめて進める。
import { formatClock, minuteOfDay } from './clock.js';
import { Spot } from './map.js';
import { CropId, CROPS, FORGE, FUELS, GOODS, MINUTES_PER_HOUR, TASK_MINUTES, TIME } from './params.js';
import { advance, GameEvent, sleepUntilMorning } from './sim.js';
import { FARM_MANA, GameState, MANA_NAMES } from './state.js';

export interface TaskOption {
  id: string;
  label: string;
  /** 所要時間（分）。0 は時間が進まない。null は「寝る」（次の朝まで） */
  minutes: number | null;
  /** 選べない理由（選べるなら null） */
  disabled: string | null;
}

export interface TaskResult {
  messages: string[];
  events: GameEvent[];
  /** 実際に進んだ分 */
  minutes: number;
}

/** 【仮】寝られるのは 18:00 以降か、深夜 */
const SLEEP_FROM = 18 * MINUTES_PER_HOUR;

/** 燃料（薪・毛・皮）の合計 */
export function fuelCount(s: GameState): number {
  return FUELS.reduce((n, f) => n + s.inv.goods[f], 0);
}

/** 燃料を使う（薪から先に）。使ったものの名前を返す */
function burnFuel(s: GameState, amount: number): string[] {
  const used: string[] = [];
  for (let i = 0; i < amount; i++) {
    const f = FUELS.find((g) => s.inv.goods[g] > 0);
    if (!f) break;
    s.inv.goods[f]--;
    used.push(GOODS[f].name);
  }
  return used;
}

function canSleep(s: GameState): boolean {
  const m = minuteOfDay(s.clock);
  return m >= SLEEP_FROM || m < TIME.MORNING;
}

export function optionsFor(s: GameState, spot: Spot): TaskOption[] {
  switch (spot.kind) {
    case 'door':
      return [
        { id: 'sleep', label: '寝る（次の朝まで）', minutes: null, disabled: canSleep(s) ? null : '18:00 をすぎたら寝られる' },
        { id: 'rest', label: '休む', minutes: TASK_MINUTES.rest, disabled: null },
        { id: 'save', label: '日記をつける（セーブ）', minutes: 0, disabled: null },
      ];
    case 'forge':
      return [
        {
          id: 'feedForge',
          label: `白のマナを入れる（燃料${fuelCount(s)}）`,
          minutes: TASK_MINUTES.feedForge,
          disabled:
            s.inv.mana.white <= 0
              ? '白のマナを持っていない'
              : fuelCount(s) < FORGE.FUEL_PER_MANA
                ? '燃料（薪・毛・皮）がない'
                : s.forge.queue.length + s.forge.ready >= FORGE.CAPACITY
                  ? '炉がいっぱい'
                  : null,
        },
        {
          id: 'takeFire',
          label: `火のマナを取り出す（${s.forge.ready}）`,
          minutes: TASK_MINUTES.takeFire,
          disabled: s.forge.ready <= 0 ? 'まだ火のマナになっていない' : null,
        },
        { id: 'lookForge', label: '炉の様子を見る', minutes: 0, disabled: null },
      ];
    case 'plot': {
      const p = s.plots[spot.plot ?? -1];
      if (!p) return [];
      if (p.stage === 'wild') return [{ id: 'till', label: '耕す', minutes: TASK_MINUTES.till, disabled: null }];
      if (p.stage === 'tilled')
        return (Object.keys(CROPS) as CropId[]).map((c) => ({
          id: `plant:${c}`,
          label: `${CROPS[c].name}の種をまく（${s.inv.seeds[c]}）`,
          minutes: TASK_MINUTES.plant,
          disabled: s.inv.seeds[c] <= 0 ? `${CROPS[c].name}の種がない` : null,
        }));
      if (p.stage === 'ready') return [{ id: 'harvest', label: '収穫する', minutes: TASK_MINUTES.harvest, disabled: null }];
      return [{ id: 'lookPlot', label: '様子を見る', minutes: 0, disabled: null }];
    }
    case 'sign':
      return [{ id: 'readSign', label: '読む', minutes: 0, disabled: null }];
  }
}

function plotStatus(s: GameState, spot: Spot): string {
  const p = s.plots[spot.plot ?? -1];
  if (!p || !p.crop) return '何も植わっていない。';
  const c = CROPS[p.crop];
  const left = c.days - p.growth;
  const stall = p.stalled ? ' マナが足りず、生育が止まっている。' : '';
  return `${c.name}が育っている。収穫まであと${left}日。${stall}`;
}

function manaLine(s: GameState): string {
  return FARM_MANA.map((m) => `${MANA_NAMES[m]}${s.inv.mana[m]}`).join(' ');
}

/** タスクを実行する。選べないタスクなら何もしない */
export function runTask(s: GameState, spot: Spot, id: string): TaskResult {
  const opt = optionsFor(s, spot).find((o) => o.id === id);
  const none: TaskResult = { messages: [], events: [], minutes: 0 };
  if (!opt || opt.disabled) return { ...none, messages: opt?.disabled ? [opt.disabled] : [] };

  const before = s.clock;
  const messages: string[] = [];
  let events: GameEvent[] = [];
  const pass = (m: number) => {
    events = events.concat(advance(s, m));
  };
  const p = spot.plot !== undefined ? s.plots[spot.plot] : undefined;

  if (id === 'sleep') {
    events = sleepUntilMorning(s);
    messages.push(`ぐっすり眠った。${formatClock(s.clock)}、朝になった。`);
  } else if (id === 'rest') {
    pass(TASK_MINUTES.rest);
    messages.push('小屋でひと休みした。');
  } else if (id === 'save') {
    events.push({ kind: 'autosave' });
    messages.push('今日のことを日記に書いた。（セーブしました）');
  } else if (id === 'feedForge') {
    s.inv.mana.white--;
    const used = burnFuel(s, FORGE.FUEL_PER_MANA);
    s.forge.queue.push(FORGE.CONVERT_MINUTES);
    pass(TASK_MINUTES.feedForge);
    messages.push(`${used.join('と')}をくべて、白のマナを炉に入れた。${FORGE.CONVERT_MINUTES / MINUTES_PER_HOUR}時間ほどで火のマナに変わりそうだ。`);
  } else if (id === 'takeFire') {
    s.inv.mana.fire += s.forge.ready;
    messages.push(`火のマナを${s.forge.ready}つ取り出した。`);
    s.forge.ready = 0;
    pass(TASK_MINUTES.takeFire);
  } else if (id === 'lookForge') {
    const q = s.forge.queue;
    if (q.length === 0 && s.forge.ready === 0) messages.push('炉は静かだ。燃料をくべて白のマナを入れると、火のマナに変わるらしい。');
    else {
      const soonest = q.length ? Math.ceil(Math.min(...q) / MINUTES_PER_HOUR) : 0;
      const parts = [];
      if (q.length) parts.push(`変化中のマナが${q.length}つ（早いもので、あと約${soonest}時間）`);
      if (s.forge.ready) parts.push(`取り出せる火のマナが${s.forge.ready}つ`);
      messages.push(`炉の中に、${parts.join('、')}。`);
    }
  } else if (id === 'till' && p) {
    p.stage = 'tilled';
    pass(TASK_MINUTES.till);
    messages.push('畑を耕した。');
  } else if (id.startsWith('plant:') && p) {
    const crop = id.slice(6) as CropId;
    s.inv.seeds[crop]--;
    p.stage = 'growing';
    p.crop = crop;
    p.growth = 0;
    p.stalled = false;
    pass(TASK_MINUTES.plant);
    messages.push(`${CROPS[crop].name}の種をまいた。毎朝、地・水・火・風のマナを1つずつ使って育つ。（いま ${manaLine(s)}）`);
  } else if (id === 'harvest' && p && p.crop) {
    const c = CROPS[p.crop];
    s.inv.crops[p.crop] += c.yield;
    messages.push(`${c.name}を${c.yield}つ収穫した！`);
    p.stage = 'tilled';
    p.crop = null;
    p.growth = 0;
    pass(TASK_MINUTES.harvest);
  } else if (id === 'lookPlot') {
    messages.push(plotStatus(s, spot));
  } else if (id === 'readSign') {
    messages.push('「この先、荒野」……まだ行けないようだ。（プロトタイプは村エリアのみ）');
  }
  return { messages, events, minutes: s.clock - before };
}
