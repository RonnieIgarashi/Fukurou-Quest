// 主人公の名前（【確定】カタカナ6文字まで）
import { NAME_MAX } from './params.js';

const KATAKANA = /^[ァ-ヴー]+$/; // ァ〜ヴ と 長音「ー」

export function isValidName(name: string): boolean {
  const chars = [...name];
  return chars.length >= 1 && chars.length <= NAME_MAX && KATAKANA.test(name);
}

/** 名前入力画面の文字盤。1行10文字。空文字はすき間 */
export const KANA_GRID: string[][] = [
  'アイウエオ', 'カキクケコ',
  'サシスセソ', 'タチツテト',
  'ナニヌネノ', 'ハヒフヘホ',
  'マミムメモ', 'ヤ ユ ヨ',
  'ラリルレロ', 'ワ ヲ ン',
  'ガギグゲゴ', 'ザジズゼゾ',
  'ダヂヅデド', 'バビブベボ',
  'パピプペポ', 'ァィゥェォ',
  'ャュョッヴ', 'ー    ',
].reduce<string[][]>((rows, half, i) => {
  const cells = [...half.padEnd(5, ' ')].map((c) => (c === ' ' ? '' : c));
  if (i % 2 === 0) rows.push(cells);
  else rows[rows.length - 1].push(...cells);
  return rows;
}, []);

/** 名前に1文字足す（上限を超えるなら変えない） */
export function appendKana(name: string, ch: string): string {
  if (!ch || [...name].length >= NAME_MAX) return name;
  return name + ch;
}

export function backspace(name: string): string {
  return [...name].slice(0, -1).join('');
}
