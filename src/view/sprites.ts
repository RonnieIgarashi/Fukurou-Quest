// キャラクターのドット絵。形（体・頭・脚など）を塗ってから、輪郭線を自動で付ける。
// DOM に依存しないので、テストで大きさや色の抜けを確かめられる。
// モクちゃん・ももっちゅりんは docs/concept/moku-momo.jpg（Ronnie のイメージ絵）に合わせて描いた。

export const PALETTE: Record<string, string> = {
  k: '#3d3029', // 輪郭（背景の絵の墨線に合わせた焦げ茶）
  // 主人公（旅人のマント）
  c: '#5e9c8c',
  C: '#3f7468',
  l: '#86bfae',
  L: '#b2dccd', // マントの一番明るい所
  s: '#f5dcc0', // 肌
  S: '#e2b096',
  e: '#3d3029', // 目
  r: '#8a5a3c', // 髪
  H: '#b0805a', // 髪の明るい所
  t: '#f1e6cc', // 中の服
  T: '#d3c09e',
  b: '#b88a5a', // かばん
  B: '#86603e',
  p: '#6a7290', // ズボン
  P: '#4f5672',
  o: '#7a5434', // 靴
  O: '#5a3c26',
  w: '#fffaf0', // 目の光
  // モクちゃん（青灰色の羽、白いおなか、赤い大きな目、赤い脚）
  m: '#a9bdd6',
  M: '#7f95b8',
  j: '#cddbea',
  n: '#f6f2e8',
  N: '#c6cbd4',
  R: '#cf4048',
  D: '#8e2a32',
  y: '#dcb874', // くちばし
  Y: '#a47c3c',
  f: '#c9584a', // 脚
  // ももっちゅりん（灰色のネズミ、青い羽、先がハートのしっぽ）
  q: '#b1b0b8',
  Q: '#85848f',
  h: '#d8d6dc',
  i: '#e9adbd', // 耳の内側・鼻
  v: '#9dbce4',
  V: '#6c8ec4',
  E: '#5a1a24',
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
  /** 1ドット幅の線 */
  line(x0: number, y0: number, x1: number, y1: number, c: string): this {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.px(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
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

// ---------------------------------------------------------------- 主人公（32x48）

export type Facing = 'down' | 'up' | 'side';

function traveler(face: Facing, step: number): SpriteDef {
  const g = new Grid(32, 48);
  const bob = step === 1 || step === 3 ? 1 : 0; // 歩くと少し上下する
  const y0 = 1 + bob;
  // 脚と靴（歩く足を交互に出す）
  const a = step === 1 ? -2 : step === 3 ? 2 : 0;
  if (face === 'side') {
    g.rect(12 + a, 38, 5, 6, 'p').rect(16 - a, 38, 5, 6, 'P');
    g.rect(12 + a, 43, 6, 4, 'o').rect(16 - a, 43, 6, 4, 'O');
  } else {
    const l = Math.max(0, a);
    const r = Math.max(0, -a);
    g.rect(10, 38 + l, 5, 6 - l, 'p').rect(17, 38 + r, 5, 6 - r, 'P');
    g.rect(10, 43 + l, 5, 4 - l, 'o').rect(17, 43 + r, 5, 4 - r, 'O');
  }
  // マント（下に広がる）
  for (let j = 0; j < 19; j++) {
    const half = 7 + Math.min(j, 13) * 0.55;
    g.rect(Math.round(16 - half), y0 + 20 + j, Math.round(half * 2), 1, 'c');
  }
  // 頭（フード）
  g.ellipse(16, y0 + 12, 10, 10.4, 'c');
  g.rect(13, y0 + 1, 6, 2, 'c'); // フードの先
  if (face === 'down') {
    // 前開きから中の服とベルト
    g.rect(13, y0 + 22, 6, 16, 't').rect(13, y0 + 30, 6, 2, 'B').px(15, y0 + 30, 'y').px(16, y0 + 30, 'y');
    g.shade((x) => x >= 17, 't', 'T');
    g.ellipse(16, y0 + 14.5, 7.2, 6.8, 's');
    g.rect(9, y0 + 8, 14, 3, 'r').px(10, y0 + 11, 'r').px(13, y0 + 11, 'r').px(18, y0 + 11, 'r').px(21, y0 + 11, 'r');
    g.rect(11, y0 + 8, 3, 1, 'H');
    g.rect(11, y0 + 13, 2, 3, 'e').rect(19, y0 + 13, 2, 3, 'e').px(11, y0 + 13, 'w').px(19, y0 + 13, 'w');
    g.rect(9, y0 + 17, 2, 1, 'S').rect(21, y0 + 17, 2, 1, 'S');
    g.px(16, y0 + 18, 'S');
    g.line(20, y0 + 21, 25, y0 + 30, 'b'); // かばんの肩ひも
    g.rect(5, y0 + 31, 3, 3, 's').rect(24, y0 + 31, 3, 3, 's'); // 手
  } else if (face === 'up') {
    g.rect(10, y0 + 23, 12, 11, 'b').rect(10, y0 + 23, 12, 3, 'B').rect(15, y0 + 25, 2, 2, 'y'); // 背中のかばん
    g.shade((x) => x >= 19, 'b', 'B');
    g.rect(5, y0 + 31, 3, 3, 's').rect(24, y0 + 31, 3, 3, 's');
  } else {
    g.ellipse(19.5, y0 + 14.5, 5.6, 6.6, 's');
    g.rect(15, y0 + 8, 10, 3, 'r').px(23, y0 + 11, 'r').px(20, y0 + 11, 'r');
    g.rect(17, y0 + 8, 3, 1, 'H');
    g.rect(21, y0 + 13, 2, 3, 'e').px(21, y0 + 13, 'w');
    g.px(25, y0 + 16, 's').px(23, y0 + 17, 'S');
    g.rect(5, y0 + 22, 8, 12, 'b').rect(5, y0 + 22, 8, 3, 'B').rect(5, y0 + 33, 8, 1, 'B'); // 背中のかばん
    g.rect(18 - a, y0 + 30, 3, 3, 's'); // 振る手
  }
  // 光は左上から：左の縁と上を明るく、右と下を暗く
  g.shade((x, y) => x <= 9 || (y <= y0 + 6 && x <= 16), 'c', 'l');
  g.shade((x, y) => x <= 7 && y <= y0 + 26, 'l', 'L');
  g.shade((x, y) => x >= 23 || y >= y0 + 35, 'c', 'C');
  return g.outline().toSprite();
}

/** 主人公の絵：[向き][歩きのコマ 0〜3] */
export const PLAYER: Record<Facing, SpriteDef[]> = {
  down: [0, 1, 2, 3].map((s) => traveler('down', s)),
  up: [0, 1, 2, 3].map((s) => traveler('up', s)),
  side: [0, 1, 2, 3].map((s) => traveler('side', s)),
};

// ---------------------------------------------------------------- モクちゃん（32x32）
// docs/concept/moku-momo.jpg に合わせる：青灰色のミミズク、白いおなか、赤い大きな目、赤い脚

function moku(frame: 'idle' | 'hop' | 'sleep'): SpriteDef {
  const g = new Grid(32, 32);
  const y = frame === 'hop' ? -2 : 0;
  // 羽（体の後ろ）。跳ねるときは広げる
  if (frame === 'hop') g.ellipse(4.5, 16 + y, 4, 6.5, 'M').ellipse(27.5, 16 + y, 4, 6.5, 'M');
  else g.ellipse(6, 21 + y, 3.6, 7, 'M').ellipse(26, 21 + y, 3.6, 7, 'M');
  g.ellipse(16, 18 + y, 11, 11.5, 'm'); // まるい体
  // 羽角（耳のような飾り羽）
  for (let i = 0; i < 7; i++) {
    const w = 2 + Math.floor(i * 0.9);
    g.rect(6, 3 + i + y, w, 1, 'm');
    g.rect(26 - w, 3 + i + y, w, 1, 'm');
  }
  g.ellipse(16, 15 + y, 9.5, 6.5, 'n'); // 顔
  g.ellipse(16, 24.5 + y, 6.5, 5, 'n'); // おなか
  for (const [fx, fy] of [[13, 23], [18, 23], [15, 26], [11, 26], [20, 26]]) g.px(fx, fy + y, 'N').px(fx + 1, fy + 1 + y, 'N');
  g.shade((x, yy) => x <= 9 && yy <= 18 + y, 'm', 'j');
  g.shade((x, yy) => x >= 24 || yy >= 26 + y, 'm', 'M');
  if (frame === 'sleep') {
    g.rect(9, 15 + y, 5, 1, 'D').rect(18, 15 + y, 5, 1, 'D');
  } else {
    g.ellipse(11.5, 15 + y, 3.4, 3.6, 'R').ellipse(20.5, 15 + y, 3.4, 3.6, 'R');
    g.rect(11, 15 + y, 2, 2, 'e').rect(20, 15 + y, 2, 2, 'e');
    g.px(10, 13 + y, 'w').px(19, 13 + y, 'w');
    g.shade((x, yy) => yy >= 17 + y, 'R', 'D');
  }
  g.rect(15, 18 + y, 2, 2, 'y').px(15, 20 + y, 'Y').px(16, 20 + y, 'Y'); // くちばし
  // 赤い脚と爪
  const fy = 29;
  g.rect(11, fy, 3, 2, 'f').rect(18, fy, 3, 2, 'f').px(10, fy + 1, 'f').px(21, fy + 1, 'f');
  return g.outline().toSprite();
}

export const MOKU = { idle: moku('idle'), hop: moku('hop'), sleep: moku('sleep') };

// ---------------------------------------------------------------- ももっちゅりん（32x32）
// 灰色のネズミに青い羽。しっぽの先はハート

function momo(frame: 'idle' | 'flap' | 'sleep'): SpriteDef {
  const g = new Grid(32, 32);
  // しっぽ（体の後ろ）
  g.line(20, 24, 24, 27, 'Q').line(24, 27, 27, 26, 'Q').line(27, 26, 28, 22, 'Q');
  g.rect(27, 19, 3, 3, 'Q').px(26, 19, 'Q').px(30, 19, 'Q').px(28, 22, 'Q');
  // 青い羽
  if (frame === 'flap') {
    g.ellipse(6, 9, 4.5, 6, 'v').ellipse(26, 9, 4.5, 6, 'v');
    g.shade((x, y) => (x <= 5 || x >= 27) && y >= 6, 'v', 'V');
  } else {
    g.ellipse(6, 18, 5, 3.6, 'v').ellipse(26, 18, 5, 3.6, 'v');
    g.shade((_, y) => y >= 19, 'v', 'V');
  }
  // 大きな耳
  g.ellipse(9.5, 7.5, 4.3, 4.3, 'q').ellipse(22.5, 7.5, 4.3, 4.3, 'q');
  g.ellipse(9.5, 7.8, 2.4, 2.4, 'i').ellipse(22.5, 7.8, 2.4, 2.4, 'i');
  g.ellipse(16, 21, 7, 6.5, 'q'); // 体
  g.ellipse(16, 13, 6.5, 5.6, 'q'); // 頭
  g.ellipse(16, 23, 4, 3.6, 'h'); // おなか
  g.shade((x, y) => x <= 11 && y <= 14, 'q', 'h');
  g.shade((x, y) => x >= 21 || y >= 26, 'q', 'Q');
  if (frame === 'sleep') g.rect(12, 13, 3, 1, 'E').rect(18, 13, 3, 1, 'E');
  else g.rect(12, 12, 2, 2, 'E').rect(19, 12, 2, 2, 'E').px(12, 12, 'w').px(19, 12, 'w');
  g.rect(15, 16, 2, 1, 'i');
  g.rect(12, 28, 2, 1, 'i').rect(18, 28, 2, 1, 'i'); // 足
  return g.outline().toSprite();
}

export const MOMO = { idle: momo('idle'), flap: momo('flap'), sleep: momo('sleep') };

// ---------------------------------------------------------------- 眠っているときの Z（5x5）

export const ZZZ: SpriteDef = new Grid(5, 5).rect(0, 0, 5, 1, 'z').px(3, 1, 'z').px(2, 2, 'z').px(1, 3, 'z').rect(0, 4, 5, 1, 'z').toSprite();
