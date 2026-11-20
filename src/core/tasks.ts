// タスク（行動）。実行すると効果を反映し、所要時間ぶん advance() で時間をまとめて進める。
import { formatClock, minuteOfDay } from './clock.js';
import { Spot } from './map.js';
import { CropId, CROPS, FORGE, FUELS, GOODS, GoodsId, MINUTES_PER_HOUR, TASK_MINUTES, TIME, WATER } from './params.js';
import { advance, GameEvent, sleepUntilMorning } from './sim.js';
import { FARM_MANA, GameState, MANA_IDS, MANA_NAMES } from './state.js';

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

/** 持ち歩いている水の合計（杯） */
export function carriedWater(s: GameState): number {
  return s.water.carried.river + s.water.carried.pure;
}

/** 収穫できる量（きれいな水で育った日が多いほど増える） */
export function harvestYield(crop: CropId, pureDays: number): number {
  const c = CROPS[crop];
  return c.yield + Math.round(c.yield * WATER.PURE_YIELD_BONUS * Math.min(1, pureDays / c.days));
}

function canSleep(s: GameState): boolean {
  const m = minuteOfDay(s.clock);
  return m >= SLEEP_FROM || m < TIME.MORNING;
}

export function optionsFor(s: GameState, spot: Spot): TaskOption[] {
  switch (spot.kind) {
    case 'bed':
      return [
        { id: 'sleep', label: '寝る（次の朝まで）', minutes: null, disabled: canSleep(s) ? null : '18:00 をすぎたら寝られる' },
        { id: 'rest', label: '横になって休む', minutes: TASK_MINUTES.rest, disabled: null },
      ];
    case 'desk':
      return [{ id: 'save', label: '日記をつける（セーブ）', minutes: 0, disabled: null }];
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
      const already = p.watered !== 'none' ? '今日はもう水をやった' : null;
      return [
        {
          id: 'water:pure',
          label: `きれいな水をやる（${s.water.carried.pure}）`,
          minutes: TASK_MINUTES.water,
          disabled: already ?? (s.water.carried.pure <= 0 ? 'きれいな水を持っていない（水くみ場でくめる）' : null),
        },
        {
          id: 'water:river',
          label: `川の水をやる（${s.water.carried.river}）`,
          minutes: TASK_MINUTES.water,
          disabled: already ?? (s.water.carried.river <= 0 ? '川の水を持っていない（水くみ場でくめる）' : null),
        },
        { id: 'lookPlot', label: '様子を見る', minutes: 0, disabled: null },
      ];
    }
    case 'barrel': {
      const full = carriedWater(s) >= WATER.CARRY_MAX ? `これ以上は持てない（${WATER.CARRY_MAX}杯ぶんまで）` : null;
      return [
        {
          id: 'drink',
          label: `水を飲む（樽のきれいな水 ${s.water.barrelPure}/${WATER.BARREL}）`,
          minutes: TASK_MINUTES.drink,
          disabled: s.water.barrelPure <= 0 ? '樽にきれいな水がない（川の水はそのままでは飲めない）' : null,
        },
        {
          id: 'purify',
          label: '樽の水を浄化する（水のマナ1）',
          minutes: TASK_MINUTES.purify,
          disabled:
            s.water.barrelPure >= WATER.BARREL ? '樽の水はもう浄化してある' : s.inv.mana.water <= 0 ? '水のマナを持っていない' : null,
        },
        {
          id: 'drawPure',
          label: 'きれいな水をくむ',
          minutes: TASK_MINUTES.drawWater,
          disabled: s.water.barrelPure < WATER.WATERING ? '樽のきれいな水が足りない' : full,
        },
        { id: 'drawRiver', label: '川の水をくむ', minutes: TASK_MINUTES.drawWater, disabled: full },
        { id: 'lookBarrel', label: '様子を見る', minutes: 0, disabled: null },
      ];
    }
    // 出入り・見るだけの場所はタスクを持たない（main.ts が扱う）
    case 'enter':
    case 'exit':
    case 'look':
      return [];
  }
}

function plotStatus(s: GameState, spot: Spot): string {
  const p = s.plots[spot.plot ?? -1];
  if (!p || !p.crop) return '何も植わっていない。';
  const c = CROPS[p.crop];
  const left = c.days - p.growth;
  const stall = p.dry ? ' 水が無く、育たなかった。' : p.stalled ? ' マナが足りず、生育が止まっている。' : '';
  const today = p.watered === 'pure' ? '今日はきれいな水をやった。' : p.watered === 'river' ? '今日は川の水をやった。' : '今日はまだ水をやっていない。';
  return `${c.name}が育っている。収穫まであと${left}日。${today}${stall}`;
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
    messages.push('ベッドで横になって、ひと休みした。');
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
    p.watered = 'none';
    p.dry = false;
    p.pureDays = 0;
    messages.push(`${CROPS[crop].name}の種をまいた。毎日水をやると、次の朝に地・火・風のマナを1つずつ使って育つ。（いま ${manaLine(s)}）`);
  } else if (id === 'harvest' && p && p.crop) {
    const c = CROPS[p.crop];
    const n = harvestYield(p.crop, p.pureDays);
    s.inv.crops[p.crop] += n;
    messages.push(n > c.yield ? `${c.name}を${n}つ収穫した！ きれいな水のおかげで、いつもより多い。` : `${c.name}を${n}つ収穫した！`);
    p.stage = 'tilled';
    p.crop = null;
    p.growth = 0;
    p.pureDays = 0;
    pass(TASK_MINUTES.harvest);
  } else if (id === 'lookPlot') {
    messages.push(plotStatus(s, spot));
  } else if (id.startsWith('water:') && p) {
    const kind = id.slice(6) as 'pure' | 'river';
    s.water.carried[kind]--;
    p.watered = kind;
    pass(TASK_MINUTES.water);
    messages.push(kind === 'pure' ? 'きれいな水をやった。よく育ちそうだ。' : '川の水をやった。');
  } else if (id === 'drink') {
    s.water.barrelPure -= WATER.DRINK;
    s.body.thirst = 0;
    pass(TASK_MINUTES.drink);
    messages.push('きれいな水を飲んだ。のどがうるおった。');
  } else if (id === 'purify') {
    s.inv.mana.water--;
    s.water.barrelPure = WATER.BARREL;
    pass(TASK_MINUTES.purify);
    messages.push(`水のマナを樽に入れた。川の水が澄んで、樽いっぱいのきれいな水になった。（飲み水${WATER.BARREL / WATER.DRINK}回・水やり${WATER.BARREL / WATER.WATERING}回ぶん）`);
  } else if (id === 'drawPure') {
    s.water.barrelPure -= WATER.WATERING;
    s.water.carried.pure++;
    pass(TASK_MINUTES.drawWater);
    messages.push(`きれいな水を1杯くんだ。（持っている水 きれい${s.water.carried.pure}・川${s.water.carried.river}）`);
  } else if (id === 'drawRiver') {
    s.water.carried.river++;
    pass(TASK_MINUTES.drawWater);
    messages.push(`川の水を1杯くんだ。（持っている水 きれい${s.water.carried.pure}・川${s.water.carried.river}）`);
  } else if (id === 'lookBarrel') {
    messages.push(
      s.water.barrelPure > 0
        ? `樽には、浄化したきれいな水が入っている（${s.water.barrelPure}/${WATER.BARREL}）。飲み水にも、畑にも使える。`
        : '水くみ場の水樽だ。川の水がたっぷりたまっている。水のマナで浄化すると、飲み水になる。',
    );
  }
  return { messages, events, minutes: s.clock - before };
}


// ---------------------------------------------------------------- 持ち物（選んで使う。2026-11-20 Ronnie）

export interface ItemAction {
  id: string;
  label: string;
  /** 使えない理由（使えるなら null） */
  disabled: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  count: string;
  actions: ItemAction[];
}

/** 持ち物の一覧（持っているものだけ）。選ぶと、その物でできることが出る */
export function inventoryItems(s: GameState): InventoryItem[] {
  const items: InventoryItem[] = [];
  const none = (why: string): ItemAction[] => [{ id: 'none', label: '使う', disabled: why }];
  if (s.water.carried.pure > 0)
    items.push({
      id: 'water:pure',
      name: 'きれいな水',
      count: `${s.water.carried.pure}杯`,
      actions: [
        { id: 'drink', label: '飲む', disabled: null },
        { id: 'none', label: '畑にやる', disabled: '畑を調べて「水をやる」を選ぶ' },
      ],
    });
  if (s.water.carried.river > 0)
    items.push({
      id: 'water:river',
      name: '川の水',
      count: `${s.water.carried.river}杯`,
      actions: [
        { id: 'none', label: '飲む', disabled: '川の水はそのままでは飲めない（水くみ場で浄化する）' },
        { id: 'none', label: '畑にやる', disabled: '畑を調べて「水をやる」を選ぶ' },
      ],
    });
  for (const c of Object.keys(CROPS) as CropId[]) {
    if (s.inv.seeds[c] > 0)
      items.push({ id: `seed:${c}`, name: `${CROPS[c].name}の種`, count: `${s.inv.seeds[c]}`, actions: none('耕した畑を調べると、まける') });
  }
  for (const c of Object.keys(CROPS) as CropId[]) {
    if (s.inv.crops[c] > 0)
      items.push({ id: `crop:${c}`, name: CROPS[c].name, count: `${s.inv.crops[c]}`, actions: none('まだ使い道がない（料理やウシのえさは準備中）') });
  }
  for (const g of Object.keys(GOODS) as GoodsId[]) {
    if (s.inv.goods[g] > 0)
      items.push({
        id: `goods:${g}`,
        name: GOODS[g].name,
        count: `${s.inv.goods[g]}`,
        actions: none(FUELS.includes(g) ? '鍛冶小屋の炉で燃料に使う' : 'まだ使い道がない'),
      });
  }
  items.push({
    id: 'mana',
    name: 'マナ',
    count: MANA_IDS.map((m) => `${MANA_NAMES[m]}${s.inv.mana[m]}`).join(' '),
    actions: none('畑・炉・水くみ場で使う'),
  });
  return items;
}

/** 持ち物を使う */
export function runItemAction(s: GameState, itemId: string, actionId: string): TaskResult {
  const item = inventoryItems(s).find((i) => i.id === itemId);
  const act = item?.actions.find((a) => a.id === actionId);
  if (!item || !act) return { messages: [], events: [], minutes: 0 };
  if (act.disabled) return { messages: [act.disabled], events: [], minutes: 0 };
  const before = s.clock;
  let events: GameEvent[] = [];
  const messages: string[] = [];
  if (itemId === 'water:pure' && actionId === 'drink') {
    s.water.carried.pure--;
    s.body.thirst = 0;
    events = advance(s, TASK_MINUTES.drink);
    messages.push('持っていたきれいな水を飲んだ。のどがうるおった。');
  }
  return { messages, events, minutes: s.clock - before };
}
