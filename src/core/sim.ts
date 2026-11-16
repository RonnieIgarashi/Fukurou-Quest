// 時間を進める処理。リアルタイムの時計もタスクの時間スキップも、必ずこの advance() を通す
// （仕様書の原則「時間更新処理を二重実装しない」）。
import { dayOf, isPastBedtime, minuteOfDay, nextMorning } from './clock.js';
import { DOOR } from './map.js';
import { CROPS, FARM_MANA_PER_PLOT_PER_DAY, MINUTES_PER_HOUR, MOMO_ARRIVAL, MOMO_SLEEP, TIME } from './params.js';
import { FARM_MANA, GameState, tileCenter } from './state.js';
import { StoryId } from './story.js';

export type GameEvent =
  | { kind: 'message'; text: string }
  | { kind: 'story'; id: StoryId }
  | { kind: 'autosave' }
  | { kind: 'forcedSleep' };

/** モクちゃんは夜（22:00〜6:00）に眠る【確定】 */
export function mokuAsleep(t: number): boolean {
  const m = minuteOfDay(t);
  return m >= TIME.NIGHT || m < TIME.MORNING;
}

/** ももっちゅりんは夜も働けるが朝に弱い【確定】。眠る時間帯は【仮】 */
export function momoAsleep(t: number): boolean {
  const m = minuteOfDay(t);
  return m >= MOMO_SLEEP.from && m < MOMO_SLEEP.to;
}

/** 毎朝 6:00 の処理：畑の生育（4属性マナを1区画ずつ均等に使う） */
function morning(s: GameState, out: GameEvent[]): void {
  let stalled = 0;
  for (const p of s.plots) {
    if (p.stage !== 'growing' || !p.crop) continue;
    const enough = FARM_MANA.every((m) => s.inv.mana[m] >= FARM_MANA_PER_PLOT_PER_DAY);
    if (!enough) {
      p.stalled = true;
      stalled++;
      continue;
    }
    for (const m of FARM_MANA) s.inv.mana[m] -= FARM_MANA_PER_PLOT_PER_DAY;
    p.stalled = false;
    p.growth++;
    if (p.growth >= CROPS[p.crop].days) p.stage = 'ready';
  }
  if (stalled > 0) out.push({ kind: 'message', text: `マナが足りず、畑の${stalled}区画の生育が止まっている。` });
  const ready = s.plots.filter((p) => p.stage === 'ready').length;
  if (ready > 0) out.push({ kind: 'message', text: `畑の${ready}区画が収穫できそうだ。` });
}

function fireStory(s: GameState, id: StoryId, out: GameEvent[]): void {
  const key = `story.${id}`;
  if (s.flags[key]) return;
  s.flags[key] = true;
  out.push({ kind: 'story', id });
}

/** 時刻の区切り（毎正時）ごとの判定 */
function onHour(s: GameState, out: GameEvent[]): void {
  const m = minuteOfDay(s.clock);
  const day = dayOf(s.clock);
  if (m === TIME.MORNING) morning(s, out);
  if (m === TIME.NIGHT) fireStory(s, 'firstNight', out);
  if (!s.companions.momo.met && (day > MOMO_ARRIVAL.day || (day === MOMO_ARRIVAL.day && m >= MOMO_ARRIVAL.minute))) {
    s.companions.momo.met = true;
    const p = s.player;
    s.companions.momo.x = p.x - 20;
    s.companions.momo.y = p.y;
    fireStory(s, 'momoArrives', out);
  }
  if (day >= TIME.ARRIVAL_DAY && m >= TIME.MORNING) fireStory(s, 'arrival', out);
  if (s.clock % TIME.AUTOSAVE_EVERY === 0) out.push({ kind: 'autosave' });
}

/** 炉：白のマナが時間とともに火のマナに変わる */
function forgeStep(s: GameState, minutes: number, out: GameEvent[]): void {
  if (s.forge.queue.length === 0) return;
  const next: number[] = [];
  let done = 0;
  for (const left of s.forge.queue) {
    const l = left - minutes;
    if (l <= 0) done++;
    else next.push(l);
  }
  s.forge.queue = next;
  if (done > 0) {
    s.forge.ready += done;
    out.push({ kind: 'message', text: `炉の白のマナが、火のマナに変わった（${done}）。` });
  }
}

/**
 * 時間を minutes 分進める。正時をまたぐたびに onHour を呼ぶので、
 * 一度に何時間進めても、1分ずつ進めても結果は同じになる。
 */
export function advance(s: GameState, minutes: number): GameEvent[] {
  const out: GameEvent[] = [];
  let remaining = Math.max(0, Math.floor(minutes));
  while (remaining > 0) {
    const toHour = MINUTES_PER_HOUR - (s.clock % MINUTES_PER_HOUR);
    const step = Math.min(remaining, toHour);
    forgeStep(s, step, out);
    s.clock += step;
    remaining -= step;
    if (s.clock % MINUTES_PER_HOUR === 0) onHour(s, out);
  }
  return out;
}

/** 眠って次の朝 6:00 まで進め、小屋の前に戻す */
export function sleepUntilMorning(s: GameState): GameEvent[] {
  const events = advance(s, nextMorning(s.clock) - s.clock);
  const home = tileCenter(DOOR.tx, DOOR.ty + 1);
  s.player.x = home.x;
  s.player.y = home.y;
  s.player.dir = 'down';
  events.push({ kind: 'autosave' });
  return events;
}

/** リアルタイムで進めたあとに呼ぶ。深夜2時を過ぎていたら強制的に眠らせる【仮】 */
export function checkBedtime(s: GameState): GameEvent[] {
  if (!isPastBedtime(s.clock)) return [];
  const events: GameEvent[] = [{ kind: 'forcedSleep' }];
  const key = 'story.forcedSleep';
  if (!s.flags[key]) {
    s.flags[key] = true;
    events.push({ kind: 'story', id: 'forcedSleep' });
  }
  return [...events, ...sleepUntilMorning(s)];
}
