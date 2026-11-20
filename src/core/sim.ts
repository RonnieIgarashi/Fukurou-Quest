// 時間を進める処理。リアルタイムの時計もタスクの時間スキップも、必ずこの advance() を通す
// （仕様書の原則「時間更新処理を二重実装しない」）。
import { dayOf, isPastBedtime, minuteOfDay, nextMorning } from './clock.js';
import { WAKE } from './map.js';
import { BODY, CROPS, MINUTES_PER_HOUR, MOMO_ARRIVAL, MOMO_SLEEP, TIME } from './params.js';
import { GameState } from './state.js';
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

/** ももっちゅは夜も働けるが朝に弱い【確定】。眠る時間帯は【仮】 */
export function momoAsleep(t: number): boolean {
  const m = minuteOfDay(t);
  return m >= MOMO_SLEEP.from && m < MOMO_SLEEP.to;
}

/**
 * 毎朝 6:00 の処理：畑の生育。
 * 前の日に水をやり、マナ（地・火・風を1つずつ）をあげてある区画だけが1日育つ。
 * マナは朝に勝手に使わない。主人公が畑で「マナをあげる」を選んだときに使い、育った朝に土から無くなる
 * （2026-11-20 Ronnie「マナは勝手に使われるものではなく、畑に行って Z で使うかどうかを決める」）。
 * きれいな水で育った日は数えておき、収穫のときに収量が増える。水は毎朝やり直し
 */
function morning(s: GameState, out: GameEvent[]): void {
  let stalled = 0;
  let dry = 0;
  for (const p of s.plots) {
    if (p.stage !== 'growing' || !p.crop) {
      p.watered = 'none';
      continue;
    }
    p.dry = p.watered === 'none';
    p.stalled = !p.dry && !p.fed;
    if (p.dry) dry++;
    else if (p.stalled) stalled++;
    else {
      p.fed = false;
      p.growth++;
      if (p.watered === 'pure') p.pureDays++;
      if (p.growth >= CROPS[p.crop].days) p.stage = 'ready';
    }
    p.watered = 'none';
  }
  if (dry > 0) out.push({ kind: 'message', text: `水が無く、畑の${dry}区画が育たなかった。毎日、水をやろう。` });
  if (stalled > 0) out.push({ kind: 'message', text: `マナが無く、畑の${stalled}区画が育たなかった。畑でマナをあげよう。` });
  const ready = s.plots.filter((p) => p.stage === 'ready').length;
  if (ready > 0) out.push({ kind: 'message', text: `畑の${ready}区画が収穫できそうだ。` });
}

/** のどの渇き・空腹が1分ぶん進む（眠っている間はゆっくり） */
function bodyStep(s: GameState, minutes: number, sleeping: boolean, out: GameEvent[]): void {
  const k = (sleeping ? BODY.SLEEP_RATE : 1) * (minutes / MINUTES_PER_HOUR);
  const before = s.body.thirst;
  s.body.thirst = Math.min(100, s.body.thirst + BODY.THIRST_PER_HOUR * k);
  s.body.hunger = Math.min(100, s.body.hunger + BODY.HUNGER_PER_HOUR * k);
  if (sleeping) return;
  if (before < BODY.THIRST_WARN && s.body.thirst >= BODY.THIRST_WARN)
    out.push({ kind: 'message', text: 'のどが渇いてきた。水くみ場で水を飲もう。' });
  if (before < BODY.THIRST_NO_RUN && s.body.thirst >= BODY.THIRST_NO_RUN)
    out.push({ kind: 'message', text: 'のどがカラカラで、走れない……。' });
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
export function advance(s: GameState, minutes: number, sleeping = false): GameEvent[] {
  const out: GameEvent[] = [];
  let remaining = Math.max(0, Math.floor(minutes));
  while (remaining > 0) {
    const toHour = MINUTES_PER_HOUR - (s.clock % MINUTES_PER_HOUR);
    const step = Math.min(remaining, toHour);
    forgeStep(s, step, out);
    bodyStep(s, step, sleeping, out);
    s.clock += step;
    remaining -= step;
    if (s.clock % MINUTES_PER_HOUR === 0) onHour(s, out);
  }
  return out;
}

/** 眠って次の朝 6:00 まで進め、小屋の中（ベッドの横）で目覚めさせる */
export function sleepUntilMorning(s: GameState): GameEvent[] {
  // 22時前に自分から寝たときは、寝ている間に「眠くなっちゃった」の場面を出さない（起きた直後に出てしまうため）
  s.flags['story.firstNight'] = true;
  const events = advance(s, nextMorning(s.clock) - s.clock, true);
  s.player.area = WAKE.area;
  s.player.x = WAKE.x;
  s.player.y = WAKE.y;
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
