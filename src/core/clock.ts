// ゲーム内時計。時刻は「1日目 0:00 からの通算分」1つの数で持つ。
import { MINUTES_PER_DAY, MINUTES_PER_HOUR, TIME } from './params.js';

/** 新しいゲームの開始時刻（1日目 6:00） */
export const START_TIME = TIME.MORNING;

/** 何日目か（1始まり） */
export function dayOf(t: number): number {
  return Math.floor(t / MINUTES_PER_DAY) + 1;
}

/** その日の 0:00 からの分 */
export function minuteOfDay(t: number): number {
  return ((t % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** "6:05" の形 */
export function formatClock(t: number): string {
  const m = minuteOfDay(t);
  const h = Math.floor(m / MINUTES_PER_HOUR);
  const mm = m % MINUTES_PER_HOUR;
  return `${h}:${mm.toString().padStart(2, '0')}`;
}

/** 22:00〜翌6:00 */
export function isNight(t: number): boolean {
  const m = minuteOfDay(t);
  return m >= TIME.NIGHT || m < TIME.MORNING;
}

/** t より後で、いちばん近い朝 6:00 */
export function nextMorning(t: number): number {
  const base = t - minuteOfDay(t);
  const today = base + TIME.MORNING;
  return t < today ? today : today + MINUTES_PER_DAY;
}

/** 起きたままでいられない時間帯（深夜2:00〜6:00）にいるか */
export function isPastBedtime(t: number): boolean {
  const m = minuteOfDay(t);
  return m >= TIME.FORCED_SLEEP && m < TIME.MORNING;
}

/** 0〜24 の小数で、その日の時刻（光の計算用） */
export function hourFloat(t: number): number {
  return minuteOfDay(t) / MINUTES_PER_HOUR;
}
