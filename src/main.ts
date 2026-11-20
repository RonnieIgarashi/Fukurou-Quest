// 起動と画面の切り替え（タイトル → セーブ枠 → 名前入力 → ムービー → フィールド）。
import { dayOf, formatClock, hourFloat, START_TIME } from './core/clock.js';
import { AreaId, AREAS, BEDS, ENTRANCES, EXIT_TO_VILLAGE, HOME, charScale, isBlockedAt, nearestFree, Spot, spotAt } from './core/map.js';
import { appendKana, backspace, isValidName, KANA_GRID } from './core/names.js';
import { BODY, NAME_MAX, TIME, WATER } from './core/params.js';
import { LocalSaveStore, MemoryKeyValue, slotIds } from './core/save/localStore.js';
import { newSaveFile } from './core/save/schema.js';
import { SaveStore, SaveSummary } from './core/save/store.js';
import { advance, checkBedtime, GameEvent, mokuAsleep, momoAsleep } from './core/sim.js';
import { createGame, Dir, GameState, MANA_IDS, ManaId } from './core/state.js';
import { fillName, Line, lookLines as lookLinesFor, Speaker, STORY, STORY_MOVIE, StoryId } from './core/story.js';
import { inventoryItems, optionsFor, runItemAction, runTask, TaskOption } from './core/tasks.js';
import { clearInput, endFrame, initInput, isHeld, wasPressed } from './input.js';
import { BASE_H, BASE_W, Ctx, spriteImage, VIEW_W } from './view/gfx.js';
import { movieExists, playMovie, portrait, preloadPortraits } from './view/media.js';
import { drawCursor, drawFrame, Screen } from './view/screen.js';
import { MOKU, MOMO, PLAYER, SpriteDef } from './view/sprites.js';
import { cameraFor, currentZoom, cycleZoom, darkness, drawWorld, PlayerAnim, updateCows } from './view/world.js';

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

const TITLE_ITEMS = ['はじめから', 'つづきから', 'もじ'];
let titleIdx = 0;

// ---- ひらがなモード（端末ごとの設定。セーブデータには入れない）
const KANA_KEY = 'fukurou-quest.kana';
try {
  screen.kana = window.localStorage.getItem(KANA_KEY) === '1';
} catch {
  /* 設定を読めない環境では漢字のまま */
}
function toggleKana(): void {
  screen.kana = !screen.kana;
  try {
    window.localStorage.setItem(KANA_KEY, screen.kana ? '1' : '0');
  } catch {
    /* 保存できなくても、この場では切り替わる */
  }
  // すばやく切り替えたとき、前の知らせが残って混乱しないよう、前の知らせは消してから出す
  toasts = toasts.filter((m) => m.key !== 'kana');
  toast(screen.kana ? 'ひらがなで表示します。' : '漢字で表示します。', 'kana');
}
const kanaLabel = () => (screen.kana ? 'もじ：ひらがな' : 'もじ：かんじ');
const titleBg: GameState = createGame('');

function updateTitle(): void {
  if (wasPressed('up')) titleIdx = (titleIdx + TITLE_ITEMS.length - 1) % TITLE_ITEMS.length;
  if (wasPressed('down')) titleIdx = (titleIdx + 1) % TITLE_ITEMS.length;
  if (wasPressed('ok')) {
    if (titleIdx === 2) toggleKana();
    else void openSlots(titleIdx === 0 ? 'new' : 'continue');
  }
}

function drawTitle(ctx: Ctx): void {
  // 背景は村。1分で1日がめぐる
  titleBg.clock = START_TIME - 60 + Math.floor((t * 24) % 1440);
  titleBg.player.x = 905;
  titleBg.player.y = 930;
  drawWorld(screen.world, titleBg, { moving: false, walked: 0 }, t);
  ctx.fillStyle = 'rgba(10, 8, 30, 0.35)';
  ctx.fillRect(0, 0, BASE_W, BASE_H);
  screen.text(BASE_W / 2, 44, 'フクロウクエスト', { size: 30, align: 'center', color: '#fff6d8', shadow: '#3a2a60' });
  screen.text(BASE_W / 2, 82, '— プロトタイプ —', { size: 10, align: 'center', color: '#c8c0f0' });
  drawFrame(ctx, BASE_W / 2 - 52, 116, 104, 60);
  TITLE_ITEMS.forEach((label, i) => {
    screen.text(BASE_W / 2 - 30, 124 + i * 16, label === 'もじ' ? kanaLabel() : label, { size: 11, color: i === titleIdx ? '#ffe066' : '#f4f0ff' });
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
  drawWorld(screen.world, titleBg, { moving: false, walked: 0 }, t);
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

type Beat = { kind: 'line'; line: Line } | { kind: 'movie'; id: string };
let beats: Beat[] = [];
let lineShown = 0;
/** 長い文の何ページ目か */
let linePage = 0;
/** 会話を下キーで閉じたあと、下キーを離すまで歩き出さない */
let holdAfterDialog = false;

type Menu =
  | { kind: 'task'; spot: Spot; options: TaskOption[]; idx: number }
  | { kind: 'main'; idx: number }
  | { kind: 'items'; idx: number; act: number | null }
  | { kind: 'party' };
let menu: Menu | null = null;

let busy: { from: number; to: number; t0: number; dur: number; sleep: boolean; after: () => void } | null = null;
let movie: { id: string; t0: number; real: boolean } | null = null;
let toasts: { text: string; t0: number; key?: string }[] = [];
let saveRequested = false;

function toast(text: string, key?: string): void {
  // 同じ種類の知らせ（もじ・ズーム・選べない理由など）と、同じ文の知らせは、前のを消してから出す
  // （2026-11-20 Ronnie：水やりで Z を連打すると、同じ知らせがいくつも並んでバグっぽく見えた）
  toasts = toasts.filter((m) => m.text !== text && (!key || m.key !== key));
  toasts.push({ text, t0: t, key });
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
  linePage = 0;
  lineShown = 0;
  menu = null;
  busy = null;
  movie = null;
  toasts = [];
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
  // 地形を直したせいで、保存した位置が通れない所の中になっていたら、近くの立てる所へ
  const p = game.player;
  Object.assign(p, nearestFree(p.area, p.x, p.y));
  slotId = slot;
  createdAt = new Date(f.createdAt);
  resetField();
  go('field');
  toast(`${dayOf(game.clock)}日目 ${formatClock(game.clock)} から再開しました。`);
}

// ---------------------------------------------------------------- フィールド：移動と調べる

/** 歩く速さ・走る速さ（px/秒、絵の px）。2026-11-16「倍くらいの速さでも動けるように」→ Shift で走る【仮】 */
const SPEED = 140;
const RUN_SPEED = 280;
const DIRS: Record<Dir, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

function blockedAt(x: number, y: number): boolean {
  // 足元の小さな四角（幅16・高さ6。家の中では人物が大きいので広げる）で当たりを取る
  const cs = charScale(game.player.area);
  const pts = [
    [x - 8 * cs, y - 6 * cs],
    [x + 8 * cs, y - 6 * cs],
    [x - 8 * cs, y],
    [x + 8 * cs, y],
  ];
  return pts.some(([px, py]) => isBlockedAt(game.player.area, px, py));
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
  // のどが渇いていると走れない（2026-11-19 Ronnie 指示）
  const sp = isHeld('run') && game.body.thirst < BODY.THIRST_NO_RUN ? RUN_SPEED : SPEED;
  const vx = (dx / len) * sp * dt;
  const vy = (dy / len) * sp * dt;
  const before = { x: p.x, y: p.y };
  if (!blockedAt(p.x + vx, p.y)) p.x += vx;
  else if (vx !== 0 && vy === 0) {
    // 横に進めないときは、少し上か下にずらして進む（反り橋の床・斜めの縁に沿って歩けるように）
    const s = Math.abs(vx);
    for (const dyTry of [s * 0.6, -s * 0.6, s * 1.2, -s * 1.2]) {
      if (!blockedAt(p.x + vx, p.y + dyTry)) {
        p.x += vx;
        p.y += dyTry;
        break;
      }
    }
  }
  if (!blockedAt(p.x, p.y + vy)) p.y += vy;
  p.x = Math.max(8, Math.min(AREAS[p.area].w - 8, p.x));
  anim.walked += Math.hypot(p.x - before.x, p.y - before.y);
  autoDoor(dx, dy);
}

/**
 * 建物の入口・出口に歩いて入ったら、Z を押さなくても出入りする（2026-11-17 Ronnie 指示）。
 * 入口は上へ、出口は下へ歩いて踏んだときだけ（向きを変えただけでは出入りしない）。
 */
function autoDoor(dx: number, dy: number): void {
  const p = game.player;
  const s = spotAt(p.area, p.x, p.y - 3);
  if (!s) return;
  if (s.kind === 'enter' && dy < 0) moveTo(s.id as AreaId, ENTRANCES[s.id as AreaId], 'up');
  else if (s.kind === 'exit' && dy > 0) {
    const from = p.area as Exclude<AreaId, 'village'>;
    moveTo('village', EXIT_TO_VILLAGE[from], 'down');
  }
}

/**
 * 仲間の動き（表示用。2026-11-16 Ronnie「ずっとくっついてこなくていい。家の周りを止まったり動いたり」）。
 * 起きている間は村の小屋のまわりを気ままに飛び回り、眠る時間は小屋の中の寝床へ。
 */
const roam: Record<'moku' | 'momo', { tx: number; ty: number; wait: number }> = {
  moku: { tx: HOME.x + 40, ty: HOME.y + 10, wait: 0 },
  momo: { tx: HOME.x - 40, ty: HOME.y + 10, wait: 0 },
};

function moveCompanions(dt: number): void {
  for (const k of ['moku', 'momo'] as const) {
    const c = game.companions[k];
    if (!c.met) continue;
    const asleep = k === 'moku' ? mokuAsleep(game.clock) : momoAsleep(game.clock);
    const bed = BEDS[k];
    if (asleep) {
      if (c.area !== bed.area) {
        c.area = bed.area;
        c.x = bed.x;
        c.y = bed.y;
      }
      const d = Math.hypot(bed.x - c.x, bed.y - c.y);
      if (d > 1) {
        const sp = Math.min(d, 50 * dt);
        c.x += ((bed.x - c.x) / d) * sp;
        c.y += ((bed.y - c.y) / d) * sp;
      }
      continue;
    }
    if (c.area !== 'village') {
      // 起きたら小屋の前へ出てくる
      c.area = 'village';
      c.x = HOME.x + (k === 'moku' ? 30 : -30);
      c.y = HOME.y + 16;
    }
    const r = roam[k];
    const dx = r.tx - c.x;
    const dy = r.ty - c.y;
    const d = Math.hypot(dx, dy);
    if (d > 2) {
      const sp = Math.min(d, (k === 'moku' ? 34 : 46) * dt);
      c.x += (dx / d) * sp;
      c.y += (dy / d) * sp;
      // 向き（素材の絵は正面・後ろ・横の3つ）。縦に動くときは正面・後ろの絵が出るよう、横は斜めより横寄りのときだけ
      if (Math.abs(dx) > Math.abs(dy) * 1.3) c.dir = dx < 0 ? 'left' : 'right';
      else c.dir = dy < 0 ? 'up' : 'down';
    } else if (r.wait > 0 && c.dir !== 'down') {
      // 止まったら、こちら（正面）を向く（2026-11-18 Ronnie「正面と背面の画像も盛り込んで」）
      c.dir = 'down';
    } else {
      r.wait -= dt;
      if (r.wait <= 0) {
        // 小屋のまわり（扉の前から半径150ほど）で、次に行く所を決める
        const a = Math.random() * Math.PI * 2;
        const rad = 30 + Math.random() * 120;
        // ときどき縦に大きく動いて、正面・後ろ姿も見せる
        const tall = Math.random() < 0.35;
        r.tx = HOME.x + Math.cos(a) * rad * (tall ? 0.4 : 1.3);
        r.ty = Math.max(HOME.y + 6, HOME.y + 60 + Math.sin(a) * rad * (tall ? 1.0 : 0.6));
        r.wait = 2 + Math.random() * 5;
      }
    }
  }
}

/** 向いている先（足元から少し前）、なければ足元で調べられるもの */
function frontSpot(): Spot | null {
  const p = game.player;
  const [dx, dy] = DIRS[p.dir];
  const fy = p.y - 3;
  const k = 18 * charScale(p.area);
  return spotAt(p.area, p.x + dx * k, fy + dy * k) ?? spotAt(p.area, p.x, fy);
}

const TALK: Record<'moku' | 'momo', { awake: string[]; asleep: string[] }> = {
  moku: {
    awake: ['畑のマナ、足りてるかな？', '炉に入れた白いマナは、だんだん赤くなるんだって。', '今日もいいお天気だね！', 'コオロギ、どこかにいないかなぁ。', 'ホウホウ、なるほどね。', '世界は、問いを持つことで広がるんだよ。Qで広がる、ってことだね'],
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
  const ks = charScale(p.area);
  const fx = p.x + dx * 16 * ks;
  const fy = p.y + dy * 16 * ks;
  for (const k of ['moku', 'momo'] as const) {
    const c = game.companions[k];
    if (c.met && c.area === p.area && Math.hypot(c.x - fx, c.y - fy) < 22 * ks) return k;
  }
  return null;
}

/** 建物に出入りした時刻（画面を暗転から戻す演出用） */
let enteredAt = -10;

function moveTo(area: AreaId, pos: { x: number; y: number }, dir: Dir): void {
  const p = game.player;
  p.area = area;
  p.x = pos.x;
  p.y = pos.y;
  p.dir = dir;
  enteredAt = t;
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
  if (spot.kind === 'enter') return moveTo(spot.id as AreaId, ENTRANCES[spot.id as AreaId], 'up');
  if (spot.kind === 'exit') {
    const from = game.player.area as Exclude<AreaId, 'village'>;
    return moveTo('village', EXIT_TO_VILLAGE[from], 'down');
  }
  if (spot.kind === 'look') return queueLines(lookLinesFor(spot.id ?? '', (w) => (w === 'moku' ? mokuAsleep(game.clock) : momoAsleep(game.clock))));
  menu = { kind: 'task', spot, options: optionsFor(game, spot), idx: 0 };
}

function runChosenTask(spot: Spot, opt: TaskOption): void {
  menu = null;
  if (opt.disabled) {
    toast(opt.disabled, 'reason');
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

  // 会話を下キーで閉じた直後は、下キーを離すまで歩き出さない
  if (holdAfterDialog && !isHeld('down')) holdAfterDialog = false;
  if (!holdAfterDialog) movePlayer(dt);
  else anim.moving = false;
  moveCompanions(dt);
  updateCows(dt);
  if (wasPressed('zoom')) {
    if (game.player.area === 'village') {
      const z = cycleZoom();
      toast(['ふだんの見え方', '少し引いた見え方', '村全体の見え方'][z] + '（Q で切り替え）', 'zoom');
    } else toast('建物の中では引いて見られません。', 'zoom');
  }
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
  const pages = dialogPages(b.line);
  const len = [...pages[Math.min(linePage, pages.length - 1)].join('')].length;
  lineShown = Math.min(len, lineShown + dt * 40);
  // 下キー（または Z・X）で、文を最後まで出す → 次のページ → 閉じる（2026-11-17 Ronnie 指示）
  if (wasPressed('ok', 'cancel', 'down')) {
    if (lineShown < len) lineShown = len;
    else if (linePage < pages.length - 1) {
      linePage++;
      lineShown = 0;
    } else {
      beats.shift();
      linePage = 0;
      lineShown = 0;
      if (wasPressed('down')) holdAfterDialog = true;
    }
  }
}

/** 会話枠の配置（話し手がいるときは左に顔） */
function dialogLayout(line: Line): { tx: number; tw: number; name: string; rows: number } {
  const hasFace = line.speaker !== 'narration';
  const name = SPEAKER_NAMES[line.speaker]();
  return { tx: hasFace ? 74 : 8, tw: hasFace ? 302 : 368, name, rows: name ? 3 : 4 };
}

/** 枠に入りきらない長い文は、ページに分けて下キーで送る */
function dialogPages(line: Line): string[][] {
  const { tw, rows } = dialogLayout(line);
  const lines = screen.wrap(line.text, tw - 20, 11);
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += rows) pages.push(lines.slice(i, i + rows));
  return pages.length ? pages : [['']];
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

const MAIN_ITEMS = ['もちもの', 'なかま', 'セーブ', 'もじ', 'タイトルへ', 'とじる'];

function updateMenu(): void {
  if (!menu) return;
  if (menu.kind === 'party') {
    if (wasPressed('ok', 'cancel', 'menu')) menu = { kind: 'main', idx: 1 };
    return;
  }
  if (menu.kind === 'items') return updateItems(menu);
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
  if (item === 'もちもの') menu = { kind: 'items', idx: 0, act: null };
  else if (item === 'なかま') menu = { kind: 'party' };
  else if (item === 'もじ') toggleKana();
  else if (item === 'セーブ') {
    void saveNow().then(() => toast('日記帳に記録しました。'));
    menu = null;
  } else if (item === 'タイトルへ') {
    void saveNow();
    menu = null;
    go('title');
  } else menu = null;
}

/** 持ち物：上下で選び、Z でその物でできること（飲む など）を出す。X でもどる */
function updateItems(m: Extract<Menu, { kind: 'items' }>): void {
  const items = inventoryItems(game);
  m.idx = Math.min(m.idx, items.length - 1);
  const it = items[m.idx];
  if (m.act === null) {
    if (wasPressed('up')) m.idx = (m.idx + items.length - 1) % items.length;
    if (wasPressed('down')) m.idx = (m.idx + 1) % items.length;
    if (wasPressed('cancel', 'menu')) menu = { kind: 'main', idx: 0 };
    else if (wasPressed('ok') && it) m.act = 0;
    return;
  }
  const n = it.actions.length;
  if (wasPressed('up')) m.act = (m.act + n - 1) % n;
  if (wasPressed('down')) m.act = (m.act + 1) % n;
  if (wasPressed('cancel', 'menu')) {
    m.act = null;
    return;
  }
  if (!wasPressed('ok')) return;
  const a = it.actions[m.act];
  if (a.disabled) {
    toast(a.disabled, 'reason');
    return;
  }
  const res = runItemAction(game, it.id, a.id);
  menu = null;
  handleEvents(res.events);
  narrate(res.messages);
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

/** マナの玉（2026-11-16「四角じゃなく丸」） */
function drawOrb(ctx: Ctx, x: number, y: number, color: string): void {
  const cx = x + 3.5;
  const cy = y + 3.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 3.6, 0, Math.PI * 2);
  ctx.fillStyle = '#1d1828';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, 2.8, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - 1, cy - 1, 0.9, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();
}

/**
 * のどの渇き（目立たないよう、時計の枠の右下に小さなしずくだけ。2026-11-19 Ronnie「目立たないような表示で」）。
 * しずくの中の水が、渇くほど減る。走れないほど渇くと、しずくがゆっくり点滅する
 */
function drawThirst(ctx: Ctx): void {
  const x = 72;
  const y = 23;
  const left = 1 - game.body.thirst / 100;
  const parched = game.body.thirst >= BODY.THIRST_NO_RUN;
  ctx.globalAlpha = parched ? 0.55 + 0.35 * Math.sin(t * 3) : 0.6;
  // しずくの形（上がとがった丸）
  const shape = [
    [3, 0, 1],
    [2, 1, 3],
    [2, 2, 3],
    [1, 3, 5],
    [1, 4, 5],
    [0, 5, 7],
    [0, 6, 7],
    [1, 7, 5],
    [2, 8, 3],
  ];
  ctx.fillStyle = '#3a3660';
  for (const [dx, dy, w] of shape) ctx.fillRect(x + dx, y + dy, w, 1);
  // 中の水（下から）
  const fillRows = Math.round(left * shape.length);
  ctx.fillStyle = parched ? '#d88a6a' : '#7fb8e8';
  shape.slice(shape.length - fillRows).forEach(([dx, dy, w]) => ctx.fillRect(x + dx, y + dy, w, 1));
  ctx.globalAlpha = 1;
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
  drawThirst(ctx);

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
  momo: () => 'ももっちゅ',
};

const FALLBACK_FACE: Record<Exclude<Speaker, 'narration'>, SpriteDef> = {
  player: PLAYER.down[0],
  moku: MOKU.idle,
  momo: MOMO.idle,
};

function drawDialog(ctx: Ctx, line: Line): void {
  // 話し手がいるときは、レジェンドオブマナのように文の左に顔を出す
  const hasFace = line.speaker !== 'narration';
  const { tx, tw, name } = dialogLayout(line);
  if (hasFace) {
    drawFrame(ctx, 8, 146, 64, 64, 0.92);
    const img = portrait(line.speaker);
    if (img) screen.image(img, 11, 149, 58, 58);
    else {
      // 顔画像が無いときは、ドット絵の上半分（顔）を大きく出す
      const def = FALLBACK_FACE[line.speaker as Exclude<Speaker, 'narration'>];
      const sh = def.h > 32 ? 26 : def.h;
      const sc = 54 / Math.max(def.w, sh);
      ctx.drawImage(spriteImage(def), 0, 0, def.w, sh, 40 - (def.w * sc) / 2, 178 - (sh * sc) / 2, def.w * sc, sh * sc);
    }
  }
  drawFrame(ctx, tx, 146, tw, 64, 0.92);
  let y = 151;
  if (name) {
    screen.text(tx + 10, y, name, { size: 10, color: '#ffe066' });
    y += 13;
  }
  const pages = dialogPages(line);
  const page = pages[Math.min(linePage, pages.length - 1)];
  // 今のページの文を、1文字ずつ出す（行の区切りはページを作ったときのまま）
  let left = Math.floor(lineShown);
  page.forEach((l, i) => {
    const chars = [...l];
    const part = chars.slice(0, Math.max(0, left)).join('');
    left -= chars.length;
    if (part) screen.text(tx + 10, y + i * 13, part, { size: 11 });
  });
  const pageLen = [...page.join('')].length;
  if (Math.floor(lineShown) >= pageLen && Math.floor(t * 2) % 2 === 0) {
    const ax = tx + tw - 12;
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(ax, 202, 5, 1);
    ctx.fillRect(ax + 1, 203, 3, 1);
    ctx.fillRect(ax + 2, 204, 1, 1);
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
    screen.text(BASE_W - 80, 53 + i * 16, label === 'もじ' ? kanaLabel() : label, { size: 10, color: sel ? '#ffe066' : '#f4f0ff' });
  });
  if (menu.kind === 'items') {
    // 持ち物の一覧（選べる）。レイアウトは仮（Ronnie がメニュー画面の絵を用意する）
    const m = menu;
    const items = inventoryItems(game);
    const h = 26 + items.length * 14 + 14;
    drawFrame(ctx, 40, 46, 250, h);
    screen.text(52, 52, 'もちもの', { size: 11, color: '#ffe066' });
    items.forEach((it, i) => {
      const y = 68 + i * 14;
      const sel = i === m.idx;
      if (sel && m.act === null) drawCursor(ctx, 46, y + 3, t);
      screen.text(56, y, it.name, { size: 10, color: sel ? '#ffe066' : '#f4f0ff' });
      screen.text(280, y, it.count, { size: 10, align: 'right', color: '#b8b0e0' });
    });
    screen.text(52, 68 + items.length * 14 + 2, `炉 変化中${game.forge.queue.length}・取り出せる火${game.forge.ready}　樽のきれいな水 ${game.water.barrelPure}/${WATER.BARREL}`, {
      size: 8,
      color: '#8a84b0',
    });
    const it = items[m.idx];
    if (m.act !== null && it) {
      const y0 = 68 + m.idx * 14;
      const w = 96;
      // 持ち物の数を隠さないよう、一覧の枠の右に出す
      drawFrame(ctx, 292, y0 - 4, w - 10, 12 + it.actions.length * 14);
      it.actions.forEach((a, i) => {
        const sel = i === m.act;
        if (sel) drawCursor(ctx, 298, y0 + 3 + i * 14, t);
        screen.text(308, y0 + i * 14, a.label, { size: 10, color: a.disabled ? '#7a74a0' : sel ? '#ffe066' : '#f4f0ff' });
      });
      const a = it.actions[m.act];
      if (a?.disabled) screen.text(52, y0 + 12 + it.actions.length * 14 + 4, a.disabled, { size: 9, color: '#ffb0b0' });
    }
  }
  if (menu.kind === 'party') {
    drawFrame(ctx, 40, 46, 230, 84);
    screen.text(52, 52, 'なかま', { size: 11, color: '#ffe066' });
    const list: [string, SpriteDef, boolean, string][] = [['モクちゃん', MOKU.idle, mokuAsleep(game.clock), '夜になると眠くなる。']];
    if (game.companions.momo.met) list.push(['ももっちゅ', MOMO.idle, momoAsleep(game.clock), '夜でも働けるが、朝に弱い。']);
    list.forEach(([name, def, asleep, note], i) => {
      const y = 70 + i * 28;
      // 会話の欄と同じ顔の絵（2026-11-20 Ronnie「セリフ欄に表示する絵に揃えて」）。読み込み前はドット絵
      const img = portrait(i === 0 ? 'moku' : 'momo');
      if (img) {
        drawFrame(ctx, 47, y - 5, 24, 24, 0.92);
        screen.image(img, 48, y - 4, 22, 22);
      } else ctx.drawImage(spriteImage(def), 50, y - 2, 20, 20);
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
  drawWorld(screen.world, game, anim, t, clock);
  // 建物の出入りのあとは、暗い所からふわっと明るくする
  const fade = 1 - Math.min(1, (t - enteredAt) / 0.45);
  if (fade > 0) {
    ctx.fillStyle = `rgba(4, 3, 12, ${fade})`;
    ctx.fillRect(0, 0, BASE_W, BASE_H);
  }
  drawHud(ctx, clock);

  // 調べられる物の前では、主人公の頭上に案内を出す
  if (!menu && !busy && !beats.length && (frontSpot() || talkTarget())) {
    // フィールド（800x450）の座標を UI（384x216）の座標に直す
    const cam = cameraFor(game);
    const k = BASE_W / (VIEW_W * currentZoom());
    const cx = Math.round((game.player.x - cam.x) * k);
    const cy = Math.round((game.player.y - cam.y - 66 * charScale(game.player.area)) * k);
    drawFrame(ctx, cx - 10, cy - 12, 20, 12, 0.85);
    screen.text(cx, cy - 11, '！', { size: 9, align: 'center', color: '#ffe066' });
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
