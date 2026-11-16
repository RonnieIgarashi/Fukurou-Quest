// 起動と画面の切り替え（タイトル → セーブ枠 → 名前入力 → ムービー → フィールド）。
import { dayOf, formatClock, hourFloat, START_TIME } from './core/clock.js';
import { DOOR, isBlocked, MAP_H, MAP_W, Spot, spotAt, TILE } from './core/map.js';
import { appendKana, backspace, isValidName, KANA_GRID } from './core/names.js';
import { CROPS, CropId, NAME_MAX, TIME } from './core/params.js';
import { LocalSaveStore, MemoryKeyValue, slotIds } from './core/save/localStore.js';
import { newSaveFile } from './core/save/schema.js';
import { SaveStore, SaveSummary } from './core/save/store.js';
import { advance, checkBedtime, GameEvent, mokuAsleep, momoAsleep } from './core/sim.js';
import { createGame, Dir, GameState, MANA_IDS, MANA_NAMES, ManaId, tileCenter } from './core/state.js';
import { fillName, Line, Speaker, STORY, STORY_MOVIE, StoryId } from './core/story.js';
import { optionsFor, runTask, TaskOption } from './core/tasks.js';
import { clearInput, endFrame, initInput, isHeld, wasPressed } from './input.js';
import { BASE_H, BASE_W, Ctx, spriteImage } from './view/gfx.js';
import { movieExists, playMovie, portrait, preloadPortraits } from './view/media.js';
import { drawCursor, drawFrame, Screen } from './view/screen.js';
import { MOKU, MOMO, PLAYER, SpriteDef } from './view/sprites.js';
import { cameraFor, darkness, drawWorld, PlayerAnim } from './view/world.js';

// ---------------------------------------------------------------- 準備

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const screen = new Screen(canvas);

function browserStorage() {
  try {
    const k = '__fukurou_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    return new MemoryKeyValue(); // プライベートブラウズなどで使えないときは、閉じるまでの一時保存
  }
}
const store: SaveStore = new LocalSaveStore(browserStorage());

initInput();
preloadPortraits(['player', 'moku', 'momo']);

type Scene = 'title' | 'slots' | 'name' | 'field';
let scene: Scene = 'title';
let t = 0;

function go(next: Scene): void {
  scene = next;
  clearInput();
}

// ---------------------------------------------------------------- タイトル

const TITLE_ITEMS = ['はじめから', 'つづきから'];
let titleIdx = 0;
const titleBg: GameState = createGame('');

function updateTitle(): void {
  if (wasPressed('up', 'down')) titleIdx = (titleIdx + 1) % TITLE_ITEMS.length;
  if (wasPressed('ok')) void openSlots(titleIdx === 0 ? 'new' : 'continue');
}

function drawTitle(ctx: Ctx): void {
  // 背景は村。1分で1日がめぐる
  titleBg.clock = START_TIME - 60 + Math.floor((t * 24) % 1440);
  titleBg.player.x = DOOR.tx * TILE + 8;
  titleBg.player.y = (DOOR.ty + 5) * TILE;
  drawWorld(ctx, titleBg, { moving: false, walked: 0 }, t);
  ctx.fillStyle = 'rgba(10, 8, 30, 0.35)';
  ctx.fillRect(0, 0, BASE_W, BASE_H);
  screen.text(BASE_W / 2, 44, 'フクロウクエスト', { size: 30, align: 'center', color: '#fff6d8', shadow: '#3a2a60' });
  screen.text(BASE_W / 2, 82, '— プロトタイプ —', { size: 10, align: 'center', color: '#c8c0f0' });
  drawFrame(ctx, BASE_W / 2 - 52, 116, 104, 44);
  TITLE_ITEMS.forEach((label, i) => {
    screen.text(BASE_W / 2 - 30, 124 + i * 16, label, { size: 11, color: i === titleIdx ? '#ffe066' : '#f4f0ff' });
    if (i === titleIdx) drawCursor(ctx, BASE_W / 2 - 44, 127 + i * 16, t);
  });
  screen.text(BASE_W / 2, 196, '↑↓ えらぶ　Z 決定　X もどる', { size: 9, align: 'center', color: '#b8b0e0' });
}

// ---------------------------------------------------------------- セーブ枠

let slotMode: 'new' | 'continue' = 'new';
let slotIdx = 0;
let slotList: (SaveSummary | null)[] = [];
let confirmOverwrite = false;

async function openSlots(mode: 'new' | 'continue'): Promise<void> {
  const list = await store.list();
  slotList = slotIds().map((id) => list.find((s) => s.slotId === id) ?? null);
  if (mode === 'continue' && slotList.every((s) => !s)) {
    toast('つづきのデータがありません。');
    return;
  }
  slotMode = mode;
  slotIdx = mode === 'continue' ? Math.max(0, slotList.findIndex((s) => s)) : Math.max(0, slotList.findIndex((s) => !s));
  confirmOverwrite = false;
  go('slots');
}

function updateSlots(): void {
  if (confirmOverwrite) {
    if (wasPressed('ok')) startNaming(slotIds()[slotIdx]);
    if (wasPressed('cancel', 'menu')) confirmOverwrite = false;
    return;
  }
  if (wasPressed('up')) slotIdx = (slotIdx + slotList.length - 1) % slotList.length;
  if (wasPressed('down')) slotIdx = (slotIdx + 1) % slotList.length;
  if (wasPressed('cancel', 'menu')) go('title');
  if (wasPressed('ok')) {
    const s = slotList[slotIdx];
    if (slotMode === 'continue') {
      if (s) void continueGame(s.slotId);
    } else if (s) confirmOverwrite = true;
    else startNaming(slotIds()[slotIdx]);
  }
}

function drawSlots(ctx: Ctx): void {
  drawTitleBackdrop(ctx);
  screen.text(BASE_W / 2, 30, slotMode === 'new' ? 'どの日記帳に記録しますか？' : 'どの日記帳から再開しますか？', { size: 12, align: 'center' });
  slotList.forEach((s, i) => {
    const y = 56 + i * 40;
    drawFrame(ctx, 60, y, 264, 34);
    const sel = i === slotIdx;
    if (sel) drawCursor(ctx, 48, y + 13, t);
    const col = sel ? '#ffe066' : '#f4f0ff';
    screen.text(72, y + 6, `日記帳 ${i + 1}`, { size: 10, color: '#b8b0e0' });
    if (s) {
      screen.text(72, y + 18, `${s.playerName}　${s.day}日目 ${formatClock(s.clock)}`, { size: 11, color: col });
      screen.text(312, y + 18, new Date(s.updatedAt).toLocaleDateString('ja-JP'), { size: 9, color: '#b8b0e0', align: 'right' });
    } else screen.text(72, y + 18, '（まだ何も書かれていない）', { size: 11, color: sel ? col : '#8a84b0' });
  });
  if (confirmOverwrite) {
    drawFrame(ctx, 92, 92, 200, 40, 0.97);
    screen.text(BASE_W / 2, 100, 'この日記帳に上書きしますか？', { size: 11, align: 'center' });
    screen.text(BASE_W / 2, 116, 'Z はい　　X いいえ', { size: 10, align: 'center', color: '#ffe066' });
  }
}

function drawTitleBackdrop(ctx: Ctx): void {
  titleBg.clock = START_TIME + 600;
  drawWorld(ctx, titleBg, { moving: false, walked: 0 }, t);
  ctx.fillStyle = 'rgba(10, 8, 30, 0.6)';
  ctx.fillRect(0, 0, BASE_W, BASE_H);
}

// ---------------------------------------------------------------- 名前入力

let nameSlot = 'slot1';
let nameStr = '';
let cur = { r: 0, c: 0 };
const NAME_ROWS = KANA_GRID.length; // この下に「けす／けってい」の行
const COMMANDS = ['けす', 'けってい'];

function startNaming(slotId: string): void {
  nameSlot = slotId;
  nameStr = '';
  cur = { r: 0, c: 0 };
  go('name');
}

/** 文字盤のカーソル移動。空きマスは飛ばし、最下段は「けす／けってい」の2つ */
function moveCursor(dr: number, dc: number): void {
  let { r, c } = cur;
  const onCommands = r === NAME_ROWS;
  if (dc !== 0) {
    if (onCommands) c = (c + dc + COMMANDS.length) % COMMANDS.length;
    else
      for (let n = 0; n < 10; n++) {
        c = (c + dc + 10) % 10;
        if (KANA_GRID[r][c]) break;
      }
    cur = { r, c };
    return;
  }
  const col = onCommands ? (c === 0 ? 2 : 7) : c;
  for (let n = 0; n <= NAME_ROWS; n++) {
    r = (r + dr + NAME_ROWS + 1) % (NAME_ROWS + 1);
    if (r === NAME_ROWS) {
      cur = { r, c: col < 5 ? 0 : 1 };
      return;
    }
    if (KANA_GRID[r][col]) {
      cur = { r, c: col };
      return;
    }
  }
}

function updateName(): void {
  if (wasPressed('up')) moveCursor(-1, 0);
  if (wasPressed('down')) moveCursor(1, 0);
  if (wasPressed('left')) moveCursor(0, -1);
  if (wasPressed('right')) moveCursor(0, 1);
  if (wasPressed('cancel')) {
    if (nameStr) nameStr = backspace(nameStr);
    else void openSlots('new');
  }
  if (wasPressed('menu')) void openSlots('new');
  if (wasPressed('ok')) {
    if (cur.r < NAME_ROWS) nameStr = appendKana(nameStr, KANA_GRID[cur.r][cur.c]);
    else if (cur.c === 0) nameStr = backspace(nameStr);
    else if (isValidName(nameStr)) void startNewGame(nameSlot, nameStr);
    else toast('名前を1文字以上入れてください。');
    if (cur.r < NAME_ROWS && [...nameStr].length >= NAME_MAX) cur = { r: NAME_ROWS, c: 1 };
  }
}

function drawName(ctx: Ctx): void {
  drawTitleBackdrop(ctx);
  drawFrame(ctx, 40, 6, 304, 34);
  screen.text(52, 11, 'あなたの名前は？（カタカナ6文字まで）', { size: 10, color: '#b8b0e0' });
  const shown = [...nameStr].concat(Array(NAME_MAX).fill('＿')).slice(0, NAME_MAX);
  shown.forEach((ch, i) => screen.text(140 + i * 18, 23, ch, { size: 13, color: i < [...nameStr].length ? '#fff6d8' : '#6f68b0' }));
  drawFrame(ctx, 40, 44, 304, 166);
  const cw = 26;
  const ch = 15;
  const x0 = 58;
  const y0 = 52;
  KANA_GRID.forEach((row, r) =>
    row.forEach((k, c) => {
      if (!k) return;
      const x = x0 + c * cw + (c >= 5 ? 8 : 0);
      const y = y0 + r * ch;
      const sel = cur.r === r && cur.c === c;
      if (sel) {
        ctx.fillStyle = 'rgba(255, 224, 102, 0.25)';
        ctx.fillRect(x - 4, y - 1, 18, 14);
      }
      screen.text(x, y, k, { size: 11, color: sel ? '#ffe066' : '#f4f0ff' });
    }),
  );
  COMMANDS.forEach((label, i) => {
    const x = 120 + i * 100;
    const y = y0 + NAME_ROWS * ch + 4;
    const sel = cur.r === NAME_ROWS && cur.c === i;
    if (sel) drawCursor(ctx, x - 12, y + 3, t);
    screen.text(x, y, label, { size: 11, color: sel ? '#ffe066' : '#f4f0ff' });
  });
}

// ---------------------------------------------------------------- フィールドの状態

let game: GameState = createGame('');
let slotId = 'slot1';
let createdAt = new Date();
let acc = 0;
const anim: PlayerAnim = { moving: false, walked: 0 };
let trail: { x: number; y: number }[] = [];

type Beat = { kind: 'line'; line: Line } | { kind: 'movie'; id: string };
let beats: Beat[] = [];
let lineShown = 0;

type Menu =
  | { kind: 'task'; spot: Spot; options: TaskOption[]; idx: number }
  | { kind: 'main'; idx: number }
  | { kind: 'items' }
  | { kind: 'party' };
let menu: Menu | null = null;

let busy: { from: number; to: number; t0: number; dur: number; sleep: boolean; after: () => void } | null = null;
let movie: { id: string; t0: number; real: boolean } | null = null;
let toasts: { text: string; t0: number }[] = [];
let saveRequested = false;

function toast(text: string): void {
  toasts.push({ text, t0: t });
  if (toasts.length > 3) toasts.shift();
}

function queueLines(lines: Line[]): void {
  for (const l of lines) beats.push({ kind: 'line', line: { ...l, text: fillName(l.text, game.playerName) } });
}

function queueStory(id: StoryId): void {
  const m = STORY_MOVIE[id];
  if (m) beats.push({ kind: 'movie', id: m });
  queueLines(STORY[id]);
}

function narrate(texts: string[]): void {
  queueLines(texts.map((text) => ({ speaker: 'narration' as Speaker, text })));
}

function handleEvents(events: GameEvent[]): void {
  for (const e of events) {
    if (e.kind === 'message') toast(e.text);
    else if (e.kind === 'story') queueStory(e.id);
    else if (e.kind === 'autosave') saveRequested = true;
  }
}

async function saveNow(): Promise<void> {
  saveRequested = false;
  const file = newSaveFile(slotId, game, new Date());
  file.createdAt = createdAt.toISOString();
  try {
    await store.save(file);
  } catch {
    toast('セーブできませんでした（ブラウザの保存領域がいっぱいかもしれません）。');
  }
}

function resetField(): void {
  acc = 0;
  beats = [];
  menu = null;
  busy = null;
  movie = null;
  toasts = [];
  trail = [{ x: game.player.x, y: game.player.y }];
}

async function startNewGame(slot: string, name: string): Promise<void> {
  game = createGame(name);
  slotId = slot;
  createdAt = new Date();
  resetField();
  game.flags['story.intro'] = true;
  queueStory('intro');
  await saveNow();
  go('field');
}

async function continueGame(slot: string): Promise<void> {
  const f = await store.load(slot);
  if (!f) {
    toast('日記帳を読めませんでした。');
    return;
  }
  game = f.game;
  slotId = slot;
  createdAt = new Date(f.createdAt);
  resetField();
  go('field');
  toast(`${dayOf(game.clock)}日目 ${formatClock(game.clock)} から再開しました。`);
}

// ---------------------------------------------------------------- フィールド：移動と調べる

const SPEED = 70; // px/秒【仮】
const DIRS: Record<Dir, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

function blockedAt(x: number, y: number): boolean {
  // 足元の小さな四角（幅10・高さ5）で当たりを取る
  const pts = [
    [x - 5, y - 5],
    [x + 4, y - 5],
    [x - 5, y - 1],
    [x + 4, y - 1],
  ];
  return pts.some(([px, py]) => px < 0 || py < 0 || py >= MAP_H * TILE || isBlocked(Math.floor(px / TILE), Math.floor(py / TILE)));
}

function movePlayer(dt: number): void {
  let dx = 0;
  let dy = 0;
  if (isHeld('left')) dx -= 1;
  if (isHeld('right')) dx += 1;
  if (isHeld('up')) dy -= 1;
  if (isHeld('down')) dy += 1;
  const p = game.player;
  anim.moving = dx !== 0 || dy !== 0;
  if (!anim.moving) return;
  p.dir = dx !== 0 ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  const len = Math.hypot(dx, dy);
  const vx = (dx / len) * SPEED * dt;
  const vy = (dy / len) * SPEED * dt;
  const before = { x: p.x, y: p.y };
  if (!blockedAt(p.x + vx, p.y)) p.x += vx;
  if (!blockedAt(p.x, p.y + vy)) p.y += vy;
  p.x = Math.max(6, Math.min(MAP_W * TILE - 6, p.x));
  anim.walked += Math.hypot(p.x - before.x, p.y - before.y);
  const last = trail[trail.length - 1];
  if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 2) {
    trail.push({ x: p.x, y: p.y });
    if (trail.length > 60) trail.shift();
  }
}

/** 仲間は飛べるので、地形を気にせず主人公についてくる。眠る時間は寝床へ */
function moveCompanions(dt: number): void {
  const follow = (c: GameState['companions']['moku'], back: number, asleep: boolean, bed: { x: number; y: number }) => {
    if (!c.met) return;
    const target = asleep ? bed : (trail[Math.max(0, trail.length - 1 - back)] ?? game.player);
    const dx = target.x - c.x;
    const dy = target.y - c.y;
    const d = Math.hypot(dx, dy);
    const near = asleep ? 1 : 10;
    if (d > near) {
      const sp = Math.min(d, (asleep ? 60 : SPEED * 1.15) * dt * (d > 80 ? 2 : 1));
      c.x += (dx / d) * sp;
      c.y += (dy / d) * sp;
      if (Math.abs(dx) > 1) c.dir = dx < 0 ? 'left' : 'right';
    }
  };
  follow(game.companions.moku, 10, mokuAsleep(game.clock), tileCenter(DOOR.tx - 2, DOOR.ty + 1));
  follow(game.companions.momo, 20, momoAsleep(game.clock), tileCenter(DOOR.tx + 3, DOOR.ty + 1));
}

/** 足元のマス */
function feetTile(): { tx: number; ty: number } {
  const p = game.player;
  return { tx: Math.floor(p.x / TILE), ty: Math.floor((p.y - 4) / TILE) };
}

/** 向いている方向の隣のマス、なければ足元のマスで調べられるもの */
function frontSpot(): Spot | null {
  const f = feetTile();
  const [dx, dy] = DIRS[game.player.dir];
  return spotAt(f.tx + dx, f.ty + dy) ?? spotAt(f.tx, f.ty);
}

const TALK: Record<'moku' | 'momo', { awake: string[]; asleep: string[] }> = {
  moku: {
    awake: ['畑のマナ、足りてるかな？', '炉に入れた白いマナは、だんだん赤くなるんだって。', 'ホゥ。今日もいいお天気！', 'コオロギ、どこかにいないかなぁ。'],
    asleep: ['スゥ……スゥ……'],
  },
  momo: {
    awake: ['夜のほうが元気が出るんだ。', 'モクちゃん、また忘れ物しそう……。', 'この小屋、もう少し広くしたいね。'],
    asleep: ['むにゃ……あと5分……'],
  },
};

function talkTarget(): 'moku' | 'momo' | null {
  const p = game.player;
  const [dx, dy] = DIRS[p.dir];
  const fx = p.x + dx * 12;
  const fy = p.y + dy * 12;
  for (const k of ['moku', 'momo'] as const) {
    const c = game.companions[k];
    if (c.met && Math.hypot(c.x - fx, c.y - fy) < 14) return k;
  }
  return null;
}

function interact(): void {
  const who = talkTarget();
  if (who) {
    const asleep = who === 'moku' ? mokuAsleep(game.clock) : momoAsleep(game.clock);
    const lines = TALK[who][asleep ? 'asleep' : 'awake'];
    queueLines([{ speaker: who, text: lines[Math.floor(t * 7) % lines.length] }]);
    return;
  }
  const spot = frontSpot();
  if (!spot) return;
  menu = { kind: 'task', spot, options: optionsFor(game, spot), idx: 0 };
}

function runChosenTask(spot: Spot, opt: TaskOption): void {
  menu = null;
  if (opt.disabled) {
    toast(opt.disabled);
    return;
  }
  const before = game.clock;
  const res = runTask(game, spot, opt.id);
  const finish = () => {
    handleEvents(res.events);
    narrate(res.messages);
  };
  if (res.minutes <= 0) {
    finish();
    if (opt.id === 'save') void saveNow();
    return;
  }
  const sleep = opt.id === 'sleep';
  busy = { from: before, to: game.clock, t0: t, dur: sleep ? 2.2 : Math.max(0.5, Math.min(1.6, res.minutes / 60)), sleep, after: finish };
  if (sleep) trail = [{ x: game.player.x, y: game.player.y }];
}

// ---------------------------------------------------------------- フィールド：更新

function updateField(dt: number): void {
  if (movie) return updateMovie();
  if (beats.length) return updateDialog(dt);
  if (busy) {
    if (t - busy.t0 >= busy.dur) {
      const after = busy.after;
      busy = null;
      after();
    }
    return;
  }
  if (menu) return updateMenu();

  movePlayer(dt);
  moveCompanions(dt);
  if (wasPressed('ok')) interact();
  else if (wasPressed('menu', 'cancel')) menu = { kind: 'main', idx: 0 };

  // 時間はプレイ中だけ進む（会話・メニュー・タスク中のアニメーションでは止まる）
  acc += dt;
  game.playSeconds += dt;
  const mins = Math.floor(acc / TIME.REAL_SECONDS_PER_GAME_MINUTE);
  if (mins > 0) {
    acc -= mins * TIME.REAL_SECONDS_PER_GAME_MINUTE;
    handleEvents(advance(game, mins));
    const bed = checkBedtime(game);
    if (bed.length) {
      trail = [{ x: game.player.x, y: game.player.y }];
      busy = { from: game.clock, to: game.clock, t0: t, dur: 2.2, sleep: true, after: () => handleEvents(bed) };
    }
  }
}

function updateDialog(dt: number): void {
  const b = beats[0];
  if (b.kind === 'movie') {
    startMovie(b.id);
    return;
  }
  const len = [...b.line.text].length;
  lineShown = Math.min(len, lineShown + dt * 40);
  if (wasPressed('ok', 'cancel')) {
    if (lineShown < len) lineShown = len;
    else {
      beats.shift();
      lineShown = 0;
    }
  }
}

function startMovie(id: string): void {
  const m = { id, t0: t, real: false };
  movie = m;
  void movieExists(id).then((ok) => {
    if (!ok || movie !== m) return;
    m.real = true;
    void playMovie(id).then(() => endMovie(m));
  });
}

function endMovie(m: typeof movie): void {
  if (movie !== m) return;
  movie = null;
  beats.shift();
  clearInput();
}

function updateMovie(): void {
  if (!movie || movie.real) return;
  if (t - movie.t0 > 0.4 && wasPressed('ok', 'cancel', 'menu')) endMovie(movie);
  else if (t - movie.t0 > 3) endMovie(movie);
}

const MAIN_ITEMS = ['もちもの', 'なかま', 'セーブ', 'タイトルへ', 'とじる'];

function updateMenu(): void {
  if (!menu) return;
  if (menu.kind === 'items' || menu.kind === 'party') {
    if (wasPressed('ok', 'cancel', 'menu')) menu = { kind: 'main', idx: menu.kind === 'items' ? 0 : 1 };
    return;
  }
  const n = menu.kind === 'task' ? menu.options.length : MAIN_ITEMS.length;
  if (wasPressed('up')) menu.idx = (menu.idx + n - 1) % n;
  if (wasPressed('down')) menu.idx = (menu.idx + 1) % n;
  if (wasPressed('cancel', 'menu')) {
    menu = null;
    return;
  }
  if (!wasPressed('ok')) return;
  if (menu.kind === 'task') {
    runChosenTask(menu.spot, menu.options[menu.idx]);
    return;
  }
  const item = MAIN_ITEMS[menu.idx];
  if (item === 'もちもの') menu = { kind: 'items' };
  else if (item === 'なかま') menu = { kind: 'party' };
  else if (item === 'セーブ') {
    void saveNow().then(() => toast('日記帳に記録しました。'));
    menu = null;
  } else if (item === 'タイトルへ') {
    void saveNow();
    menu = null;
    go('title');
  } else menu = null;
}

// ---------------------------------------------------------------- フィールド：描画

const MANA_COLORS: Record<ManaId, string> = {
  white: '#f2f0ff',
  earth: '#c08a48',
  water: '#4f9ae6',
  fire: '#ee5a36',
  wind: '#7fd6a8',
};

function displayClock(): number {
  if (!busy) return game.clock;
  const k = Math.min(1, (t - busy.t0) / busy.dur);
  return Math.round(busy.from + (busy.to - busy.from) * k);
}

function drawOrb(ctx: Ctx, x: number, y: number, color: string): void {
  ctx.fillStyle = '#1d1828';
  ctx.fillRect(x, y + 1, 7, 5);
  ctx.fillRect(x + 1, y, 5, 7);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, 5, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(x + 2, y + 2, 1, 1);
}

function drawHud(ctx: Ctx, clock: number): void {
  drawFrame(ctx, 6, 6, 78, 30, 0.8);
  screen.text(14, 9, `${dayOf(clock)}日目`, { size: 11 });
  const hour = hourFloat(clock);
  const night = darkness(hour) > 0.5;
  if (night) {
    // 三日月
    ctx.fillStyle = '#f0e8a0';
    ctx.fillRect(15, 24, 3, 1);
    ctx.fillRect(14, 25, 2, 4);
    ctx.fillRect(15, 29, 3, 1);
    ctx.fillRect(16, 28, 2, 1);
    ctx.fillRect(16, 25, 1, 1);
  } else {
    // 太陽
    ctx.fillStyle = '#ffb838';
    ctx.fillRect(15, 25, 4, 4);
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(16, 23, 2, 1);
    ctx.fillRect(16, 30, 2, 1);
    ctx.fillRect(13, 26, 1, 2);
    ctx.fillRect(20, 26, 1, 2);
  }
  screen.text(24, 22, formatClock(clock), { size: 10, color: '#e8e2ff' });

  const w = 5 * 30 + 8;
  const x0 = BASE_W - 6 - w;
  drawFrame(ctx, x0, 6, w, 18, 0.8);
  MANA_IDS.forEach((m, i) => {
    const x = x0 + 6 + i * 30;
    drawOrb(ctx, x, 11, MANA_COLORS[m]);
    screen.text(x + 10, 10, String(game.inv.mana[m]), { size: 9 });
  });
}

function drawToasts(ctx: Ctx): void {
  toasts = toasts.filter((m) => t - m.t0 < 4);
  toasts.forEach((m, i) => {
    const age = t - m.t0;
    const a = age > 3.4 ? (4 - age) / 0.6 : 1;
    const w = Math.min(340, screen.textWidth(m.text, 10) + 16);
    const x = (BASE_W - w) / 2;
    // 画面の下側に出す（会話中は会話枠の上）。新しいものほど下
    const bottom = beats.length && scene === 'field' ? 132 : BASE_H - 22;
    const y = bottom - (toasts.length - 1 - i) * 18;
    ctx.globalAlpha = a;
    drawFrame(ctx, x, y, w, 16, 0.85);
    ctx.globalAlpha = 1;
    screen.text(BASE_W / 2, y + 3, m.text, { size: 10, align: 'center', alpha: a });
  });
}

const SPEAKER_NAMES: Record<Speaker, () => string> = {
  narration: () => '',
  player: () => game.playerName,
  moku: () => 'モクちゃん',
  momo: () => 'ももっちゅりん',
};

const FALLBACK_FACE: Record<Exclude<Speaker, 'narration'>, SpriteDef> = {
  player: PLAYER.down[0],
  moku: MOKU.idle,
  momo: MOMO.idle,
};

function drawDialog(ctx: Ctx, line: Line): void {
  const hasFace = line.speaker !== 'narration';
  if (hasFace) {
    drawFrame(ctx, 8, 96, 56, 56, 0.92);
    const img = portrait(line.speaker);
    if (img) screen.image(img, 11, 99, 50, 50);
    else {
      const def = FALLBACK_FACE[line.speaker as Exclude<Speaker, 'narration'>];
      const sc = def.h > 16 ? 2 : 3;
      ctx.drawImage(spriteImage(def), 36 - (def.w * sc) / 2, 124 - (def.h * sc) / 2 + (def.h > 16 ? 6 : 0), def.w * sc, def.h * sc);
    }
  }
  drawFrame(ctx, 8, 152, 368, 58, 0.92);
  let y = 157;
  const name = SPEAKER_NAMES[line.speaker]();
  if (name) {
    screen.text(18, y, name, { size: 10, color: '#ffe066' });
    y += 13;
  }
  const shown = [...line.text].slice(0, Math.floor(lineShown)).join('');
  screen.wrap(shown, 348, 11).slice(0, name ? 3 : 4).forEach((l, i) => screen.text(18, y + i * 13, l, { size: 11 }));
  if (Math.floor(lineShown) >= [...line.text].length && Math.floor(t * 2) % 2 === 0) {
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(364, 202, 5, 1);
    ctx.fillRect(365, 203, 3, 1);
    ctx.fillRect(366, 204, 1, 1);
  }
}

function minutesLabel(o: TaskOption): string {
  if (o.minutes === null) return '朝まで';
  if (o.minutes === 0) return '';
  return o.minutes >= 60 ? `${o.minutes / 60}時間` : `${o.minutes}分`;
}

function drawMenu(ctx: Ctx): void {
  if (!menu) return;
  if (menu.kind === 'task') {
    const m = menu;
    const w = 200;
    const h = 14 + m.options.length * 16;
    const x = BASE_W - w - 10;
    const y = 46;
    drawFrame(ctx, x, y, w, h);
    m.options.forEach((o, i) => {
      const sel = i === m.idx;
      const col = o.disabled ? '#7a74a0' : sel ? '#ffe066' : '#f4f0ff';
      if (sel) drawCursor(ctx, x + 6, y + 10 + i * 16, t);
      screen.text(x + 16, y + 7 + i * 16, o.label, { size: 10, color: col });
      screen.text(x + w - 8, y + 7 + i * 16, minutesLabel(o), { size: 9, color: '#b8b0e0', align: 'right' });
    });
    const o = m.options[m.idx];
    if (o?.disabled) screen.text(x + w - 4, y + h + 3, o.disabled, { size: 9, color: '#ffb0b0', align: 'right' });
    return;
  }
  drawFrame(ctx, BASE_W - 96, 46, 86, 14 + MAIN_ITEMS.length * 16);
  MAIN_ITEMS.forEach((label, i) => {
    const mm = menu!;
    const sel = mm.kind === 'main' && i === mm.idx;
    if (sel) drawCursor(ctx, BASE_W - 90, 56 + i * 16, t);
    screen.text(BASE_W - 80, 53 + i * 16, label, { size: 10, color: sel ? '#ffe066' : '#f4f0ff' });
  });
  if (menu.kind === 'items') {
    drawFrame(ctx, 40, 46, 230, 120);
    screen.text(52, 52, 'もちもの', { size: 11, color: '#ffe066' });
    const crops = Object.keys(CROPS) as CropId[];
    const rows = [
      ...crops.map((c) => `${CROPS[c].name}の種　${game.inv.seeds[c]}`),
      ...crops.map((c) => `${CROPS[c].name}　${game.inv.crops[c]}`),
      `マナ　${MANA_IDS.map((m) => `${MANA_NAMES[m]}${game.inv.mana[m]}`).join('　')}`,
      `炉　変化中${game.forge.queue.length}・取り出せる火${game.forge.ready}`,
    ];
    rows.forEach((r, i) => screen.text(52, 68 + i * 14, r, { size: 10 }));
  }
  if (menu.kind === 'party') {
    drawFrame(ctx, 40, 46, 230, 84);
    screen.text(52, 52, 'なかま', { size: 11, color: '#ffe066' });
    const list: [string, SpriteDef, boolean, string][] = [['モクちゃん', MOKU.idle, mokuAsleep(game.clock), '夜になると眠くなる。']];
    if (game.companions.momo.met) list.push(['ももっちゅりん', MOMO.idle, momoAsleep(game.clock), '夜でも働けるが、朝に弱い。']);
    list.forEach(([name, def, asleep, note], i) => {
      const y = 70 + i * 28;
      ctx.drawImage(spriteImage(def), 52, y);
      screen.text(74, y, `${name}　${asleep ? '（ねている）' : '（おきている）'}`, { size: 10 });
      screen.text(74, y + 13, note, { size: 9, color: '#b8b0e0' });
    });
  }
}

function drawMoviePlaceholder(ctx: Ctx, id: string): void {
  ctx.fillStyle = '#05040c';
  ctx.fillRect(0, 0, BASE_W, BASE_H);
  ctx.fillStyle = '#1a1830';
  ctx.fillRect(0, 30, BASE_W, 1);
  ctx.fillRect(0, BASE_H - 31, BASE_W, 1);
  screen.text(BASE_W / 2, 84, `MOVIE「${id}」`, { size: 14, align: 'center', color: '#fff6d8' });
  screen.text(BASE_W / 2, 108, `ここにムービーが入ります（assets/movies/${id}.mp4）`, { size: 9, align: 'center', color: '#8a84b0' });
  screen.text(BASE_W / 2, 186, 'Z で次へ', { size: 9, align: 'center', color: '#8a84b0' });
}

function drawField(ctx: Ctx): void {
  if (movie) {
    if (!movie.real) drawMoviePlaceholder(ctx, movie.id);
    return;
  }
  const clock = displayClock();
  drawWorld(ctx, game, anim, t, clock);
  drawHud(ctx, clock);

  // 調べられる物の前では、主人公の頭上に案内を出す
  if (!menu && !busy && !beats.length && (frontSpot() || talkTarget())) {
    const cam = cameraFor(game);
    const cx = Math.round(game.player.x - cam.x);
    const cy = Math.round(game.player.y - cam.y);
    drawFrame(ctx, cx - 10, cy - 38, 20, 12, 0.85);
    screen.text(cx, cy - 37, 'Z', { size: 9, align: 'center', color: '#ffe066' });
  }

  if (busy) {
    const k = Math.min(1, (t - busy.t0) / busy.dur);
    if (busy.sleep) {
      ctx.fillStyle = `rgba(4, 3, 12, ${Math.sin(k * Math.PI)})`;
      ctx.fillRect(0, 0, BASE_W, BASE_H);
    }
    const dots = '・'.repeat(1 + (Math.floor(t * 4) % 3));
    screen.text(BASE_W / 2, 100, busy.sleep ? `Zzz${dots}` : `作業中${dots}`, { size: 12, align: 'center', color: '#fff6d8' });
  }
  drawToasts(ctx);
  drawMenu(ctx);
  const b = beats[0];
  if (b && b.kind === 'line') drawDialog(ctx, b.line);
}

// ---------------------------------------------------------------- ループ

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  t += dt;
  if (scene === 'title') updateTitle();
  else if (scene === 'slots') updateSlots();
  else if (scene === 'name') updateName();
  else updateField(dt);
  if (saveRequested && scene === 'field') void saveNow();

  const ctx = screen.begin();
  if (scene === 'title') drawTitle(ctx);
  else if (scene === 'slots') drawSlots(ctx);
  else if (scene === 'name') drawName(ctx);
  else drawField(ctx);
  if (scene !== 'field') drawToasts(ctx);
  screen.present();
  endFrame();
  requestAnimationFrame(frame);
}

// タブを閉じる・隠すときにも記録する（中断・再開しやすくする）
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && scene === 'field') void saveNow();
});
window.addEventListener('pagehide', () => {
  if (scene === 'field') void saveNow();
});

// 開発中の確認用（ブラウザのコンソールから時間を進める）
(window as unknown as { fq: unknown }).fq = {
  get game() {
    return game;
  },
  advance: (m: number) => handleEvents(advance(game, m)),
};

document.fonts?.load(`12px "DotGothic16"`).finally(() => requestAnimationFrame(frame));
