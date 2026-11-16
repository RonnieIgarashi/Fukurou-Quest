// キャラクターのドット絵。形（体・頭・脚など）を塗ってから、輪郭線を自動で付ける。
// DOM に依存しないので、テストで大きさや色の抜けを確かめられる。
// モクちゃん・ももっちゅりんの見た目は仕様書の文章から起こした【仮】。正式な絵（Ronnie が用意）に差し替える。

export const PALETTE: Record<string, string> = {
  k: '#1d1828', // 輪郭
  // 主人公（旅人のマント）
  c: '#3f8a7e',
  C: '#2b5f58',
  l: '#6cb8a6',
  s: '#f3cfa6', // 肌
  S: '#d49b75',
  e: '#2a2233', // 目
  r: '#6b4430', // 髪
  b: '#a8743f', // かばん
  B: '#714b28',
  p: '#4c5577', // ズボン
  P: '#343b57',
  o: '#5e3d24', // 靴
  w: '#fbf7ec', // 白
  // モクちゃん（薄い青〜グレーの体、赤い大きな目、赤い脚）
  m: '#a9bfd4',
  M: '#7f97b0',
  n: '#d6e3ee',
  R: '#e0404f',
  D: '#9c2436',
  g: '#59627a', // くちばし
  // ももっちゅりん（羽を持つネズミ）
  q: '#e8c9b4',
  Q: '#c79f88',
  i: '#f7a3b6', // 耳の内側・鼻
  v: '#f4f7ff', // 羽
  V: '#c6cfe6',
  // 寝ているときの Z
  z: '#ffffff',
};

export interface SpriteDef {
  w: number;
  h: number;
  rows: string[];
}

/** 塗り絵用の小さなキャンバス（文字の2次元配列） */
export class Grid {
  readonly cells: string[][];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.cells = Array.from({ length: h }, () => Array<string>(w).fill('.'));
  }
  px(x: number, y: number, c: string): this {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y][x] = c;
    return this;
  }
  rect(x: number, y: number, w: number, h: number, c: string): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
    return this;
  }
  /** 楕円（中心は小数でよい） */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string): this {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c);
      }
    return this;
  }
  /** 塗られている所だけ色を差し替える（陰影づけ用） */
  shade(test: (x: number, y: number) => boolean, from: string, to: string): this {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.cells[y][x] === from && test(x, y)) this.cells[y][x] = to;
    return this;
  }
  /** 塗られた形のまわりに輪郭線を付ける */
  outline(c = 'k'): this {
    const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h && this.cells[y][x] !== '.' && this.cells[y][x] !== c;
    const marks: [number, number][] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.cells[y][x] !== '.') continue;
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) marks.push([x, y]);
      }
    for (const [x, y] of marks) this.cells[y][x] = c;
    return this;
  }
  toSprite(): SpriteDef {
    return { w: this.w, h: this.h, rows: this.cells.map((r) => r.join('')) };
  }
}

// ---------------------------------------------------------------- 主人公（16x24）

export type Facing = 'down' | 'up' | 'side';

function traveler(face: Facing, step: number): SpriteDef {
  const g = new Grid(16, 24);
  const bob = step === 1 || step === 3 ? 1 : 0; // 歩くと少し上下する
  const y0 = 1 + bob;
  // 脚（歩く足の位置を交互に）
  const legL = step === 1 ? -1 : step === 3 ? 1 : 0;
  const legR = -legL;
  if (face === 'side') {
    g.rect(6 + legL, 18, 3, 4, 'p').rect(8 + legR, 18, 3, 4, 'P');
    g.rect(6 + legL, 21, 3, 2, 'o').rect(8 + legR, 21, 3, 2, 'o');
  } else {
    g.rect(5, 18 + Math.max(0, legL), 3, 4 - Math.max(0, legL), 'p').rect(8, 18 + Math.max(0, legR), 3, 4 - Math.max(0, legR), 'P');
    g.rect(5, 21, 3, 2, 'o').rect(8, 21, 3, 2, 'o');
  }
  // マント（下に広がる）
  for (let j = 0; j < 9; j++) {
    const half = 3 + Math.min(j, 6) * 0.5;
    g.rect(Math.round(8 - half), y0 + 10 + j, Math.round(half * 2), 1, 'c');
  }
  // 頭（フード）
  g.ellipse(8, y0 + 6, 5, 5.2, 'c');
  if (face === 'down') {
    g.ellipse(8, y0 + 7.2, 3.4, 3.2, 's');
    g.rect(5, y0 + 4, 6, 2, 'r'); // 前髪
    g.px(6, y0 + 7, 'e').px(9, y0 + 7, 'e');
    g.px(5, y0 + 8, 'S').px(10, y0 + 8, 'S');
    // かばんの肩ひもと手
    g.px(9, y0 + 11, 'b').px(10, y0 + 12, 'b').px(11, y0 + 13, 'b');
    g.rect(3, y0 + 15, 2, 2, 's').rect(11, y0 + 15, 2, 2, 's');
  } else if (face === 'up') {
    g.rect(5, y0 + 12, 6, 5, 'b').rect(5, y0 + 16, 6, 1, 'B'); // 背中のかばん
    g.rect(3, y0 + 15, 2, 2, 's').rect(11, y0 + 15, 2, 2, 's');
  } else {
    g.ellipse(10, y0 + 7.2, 2.6, 3, 's');
    g.rect(8, y0 + 4, 5, 2, 'r');
    g.px(11, y0 + 7, 'e');
    g.px(12, y0 + 8, 'S');
    g.rect(3, y0 + 12, 4, 5, 'b').rect(3, y0 + 16, 4, 1, 'B'); // 背中のかばん
    g.rect(9 + legR, y0 + 15, 2, 2, 's');
  }
  // 光は左上から：左の縁を明るく、右と下を暗く
  g.shade((x, y) => x <= 4 || (y <= y0 + 3 && x <= 8), 'c', 'l');
  g.shade((x, y) => x >= 11 || y >= y0 + 17, 'c', 'C');
  return g.outline().toSprite();
}

/** 主人公の絵：[向き][歩きのコマ 0〜3] */
export const PLAYER: Record<Facing, SpriteDef[]> = {
  down: [0, 1, 2, 3].map((s) => traveler('down', s)),
  up: [0, 1, 2, 3].map((s) => traveler('up', s)),
  side: [0, 1, 2, 3].map((s) => traveler('side', s)),
};

// ---------------------------------------------------------------- モクちゃん（16x16）

function moku(frame: 'idle' | 'hop' | 'sleep'): SpriteDef {
  const g = new Grid(16, 16);
  const y = frame === 'hop' ? -1 : 0;
  g.ellipse(8, 9 + y, 6, 5.6, 'm'); // まるい体
  g.px(3, 3 + y, 'm').rect(3, 4 + y, 2, 1, 'm').px(12, 3 + y, 'm').rect(11, 4 + y, 2, 1, 'm'); // ミミズクの羽角
  g.ellipse(8, 11 + y, 3.6, 3, 'n'); // おなか
  g.shade((x, yy) => x >= 12 || yy >= 13 + y, 'm', 'M');
  if (frame === 'sleep') {
    g.rect(4, 8 + y, 3, 1, 'D').rect(9, 8 + y, 3, 1, 'D'); // 閉じた目
  } else {
    g.ellipse(5.5, 8 + y, 1.9, 1.9, 'R').ellipse(10.5, 8 + y, 1.9, 1.9, 'R'); // 赤い大きな目
    g.px(5, 8 + y, 'e').px(10, 8 + y, 'e');
    g.px(4, 7 + y, 'w').px(9, 7 + y, 'w');
  }
  g.px(7, 10 + y, 'g').px(8, 10 + y, 'g'); // 小さなくちばし
  g.rect(5, 14 + y, 2, 1, 'R').rect(9, 14 + y, 2, 1, 'R'); // 赤い脚
  return g.outline().toSprite();
}

export const MOKU = { idle: moku('idle'), hop: moku('hop'), sleep: moku('sleep') };

// ---------------------------------------------------------------- ももっちゅりん（16x16）

function momo(frame: 'idle' | 'flap' | 'sleep'): SpriteDef {
  const g = new Grid(16, 16);
  // 羽（体の後ろ）
  if (frame === 'flap') g.ellipse(3, 6, 2.6, 3.2, 'v').ellipse(13, 6, 2.6, 3.2, 'v');
  else g.ellipse(2.8, 9, 2.4, 2.4, 'v').ellipse(13.2, 9, 2.4, 2.4, 'v');
  g.shade((_, y) => y >= 9, 'v', 'V');
  g.ellipse(4.5, 4.5, 2.5, 2.5, 'q').ellipse(11.5, 4.5, 2.5, 2.5, 'q'); // 大きな耳
  g.ellipse(4.5, 4.5, 1.2, 1.2, 'i').ellipse(11.5, 4.5, 1.2, 1.2, 'i');
  g.ellipse(8, 9.5, 5, 4.6, 'q'); // 体
  g.shade((x, y) => x >= 11 || y >= 12, 'q', 'Q');
  if (frame === 'sleep') g.rect(5, 9, 2, 1, 'e').rect(9, 9, 2, 1, 'e');
  else g.px(6, 9, 'e').px(10, 9, 'e').px(6, 8, 'w');
  g.px(8, 11, 'i');
  g.rect(13, 13, 2, 1, 'Q').px(15, 12, 'Q'); // しっぽ
  return g.outline().toSprite();
}

export const MOMO = { idle: momo('idle'), flap: momo('flap'), sleep: momo('sleep') };

// ---------------------------------------------------------------- 眠っているときの Z（5x5）

export const ZZZ: SpriteDef = new Grid(5, 5).rect(0, 0, 5, 1, 'z').px(3, 1, 'z').px(2, 2, 'z').px(1, 3, 'z').rect(0, 4, 5, 1, 'z').toSprite();
