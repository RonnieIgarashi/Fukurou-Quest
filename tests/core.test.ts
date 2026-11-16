import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayOf, formatClock, isNight, isPastBedtime, nextMorning, START_TIME } from '../src/core/clock.js';
import { DOOR, isBlocked, plotTiles, spotAt } from '../src/core/map.js';
import { appendKana, backspace, isValidName, KANA_GRID } from '../src/core/names.js';
import { CROPS, FORGE, MINUTES_PER_DAY, TIME } from '../src/core/params.js';
import { LocalSaveStore, MemoryKeyValue } from '../src/core/save/localStore.js';
import { migrate, newSaveFile, SAVE_SCHEMA } from '../src/core/save/schema.js';
import { advance, checkBedtime, mokuAsleep, momoAsleep, sleepUntilMorning } from '../src/core/sim.js';
import { createGame } from '../src/core/state.js';
import { optionsFor, runTask } from '../src/core/tasks.js';

const at = (day: number, h: number, m = 0) => (day - 1) * MINUTES_PER_DAY + h * 60 + m;

// ---------------------------------------------------------------- 時計

test('開始は1日目 6:00', () => {
  assert.equal(dayOf(START_TIME), 1);
  assert.equal(formatClock(START_TIME), '6:00');
});

test('夜は 22:00〜6:00、深夜2時からは起きていられない', () => {
  assert.equal(isNight(at(1, 21, 59)), false);
  assert.equal(isNight(at(1, 22)), true);
  assert.equal(isNight(at(2, 5, 59)), true);
  assert.equal(isPastBedtime(at(2, 1, 59)), false);
  assert.equal(isPastBedtime(at(2, 2)), true);
});

test('次の朝：夜中なら同じ日の 6:00、昼なら翌日の 6:00', () => {
  assert.equal(nextMorning(at(2, 1)), at(2, 6));
  assert.equal(nextMorning(at(1, 6)), at(2, 6));
  assert.equal(nextMorning(at(1, 23)), at(2, 6));
});

// ---------------------------------------------------------------- 時間の進行は1か所

test('一度に進めても、1分ずつ進めても同じ状態になる', () => {
  const a = createGame('テスト');
  const b = createGame('テスト');
  for (const g of [a, b]) {
    g.inv.mana.fire = 5;
    runTask(g, spotAt(plotTiles()[0].tx, plotTiles()[0].ty)!, 'till');
    runTask(g, spotAt(plotTiles()[0].tx, plotTiles()[0].ty)!, 'plant:bean');
    runTask(g, spotAt(22, 7)!, 'feedForge');
  }
  advance(a, 3 * MINUTES_PER_DAY);
  for (let i = 0; i < 3 * MINUTES_PER_DAY; i++) advance(b, 1);
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------- 畑

test('豆は4属性のマナを毎朝1つずつ使って育ち、収穫できる', () => {
  const g = createGame('テスト');
  g.inv.mana.fire = 10;
  const spot = spotAt(plotTiles()[0].tx, plotTiles()[0].ty)!;
  runTask(g, spot, 'till');
  runTask(g, spot, 'plant:bean');
  const earth = g.inv.mana.earth;
  for (let d = 0; d < CROPS.bean.days; d++) sleepUntilMorning(g);
  assert.equal(g.plots[0].stage, 'ready');
  assert.equal(g.inv.mana.earth, earth - CROPS.bean.days);
  const r = runTask(g, spot, 'harvest');
  assert.equal(g.inv.crops.bean, CROPS.bean.yield);
  assert.ok(r.messages[0].includes('収穫'));
  assert.equal(g.plots[0].stage, 'tilled');
});

test('火のマナが無いと生育が止まる（4属性のどれかが欠けると止まる）', () => {
  const g = createGame('テスト');
  assert.equal(g.inv.mana.fire, 0);
  const spot = spotAt(plotTiles()[1].tx, plotTiles()[1].ty)!;
  runTask(g, spot, 'till');
  runTask(g, spot, 'plant:bean');
  const events = sleepUntilMorning(g);
  assert.equal(g.plots[1].growth, 0);
  assert.equal(g.plots[1].stalled, true);
  assert.ok(events.some((e) => e.kind === 'message' && e.text.includes('生育が止まっている')));
  assert.equal(g.inv.mana.earth, createGame('テスト').inv.mana.earth); // 止まった区画はマナを使わない
});

// ---------------------------------------------------------------- 炉

test('炉：白のマナが一定時間で火のマナに変わり、取り出せる', () => {
  const g = createGame('テスト');
  const forge = spotAt(21, 6)!;
  assert.equal(forge.kind, 'forge');
  runTask(g, forge, 'feedForge');
  assert.equal(g.forge.queue.length, 1);
  advance(g, FORGE.CONVERT_MINUTES);
  assert.equal(g.forge.ready, 1);
  runTask(g, forge, 'takeFire');
  assert.equal(g.inv.mana.fire, 1);
  assert.equal(g.forge.ready, 0);
});

test('炉は容量を超えて入れられない', () => {
  const g = createGame('テスト');
  const forge = spotAt(21, 6)!;
  for (let i = 0; i < FORGE.CAPACITY; i++) runTask(g, forge, 'feedForge');
  const opt = optionsFor(g, forge).find((o) => o.id === 'feedForge')!;
  assert.equal(opt.disabled, '炉がいっぱい');
});

// ---------------------------------------------------------------- 仲間・イベント

test('モクちゃんは夜に眠り、ももっちゅりんは朝に眠る', () => {
  assert.equal(mokuAsleep(at(1, 21)), false);
  assert.equal(mokuAsleep(at(1, 23)), true);
  assert.equal(momoAsleep(at(2, 7)), true);
  assert.equal(momoAsleep(at(2, 23)), false);
});

test('最初の夜と、3日目の朝にイベントが起きる（1回だけ）', () => {
  const g = createGame('テスト');
  const e1 = advance(g, at(1, 22) - g.clock);
  assert.ok(e1.some((e) => e.kind === 'story' && e.id === 'firstNight'));
  const e2 = advance(g, at(3, 10) - g.clock);
  assert.ok(e2.some((e) => e.kind === 'story' && e.id === 'momoArrives'));
  assert.equal(g.companions.momo.met, true);
  const e3 = advance(g, MINUTES_PER_DAY);
  assert.ok(!e3.some((e) => e.kind === 'story'));
});

test('深夜2時を過ぎると眠ってしまい、6:00 に小屋の前で目覚める', () => {
  const g = createGame('テスト');
  advance(g, at(2, 2) - g.clock);
  const events = checkBedtime(g);
  assert.ok(events.some((e) => e.kind === 'forcedSleep'));
  assert.equal(formatClock(g.clock), '6:00');
  assert.equal(dayOf(g.clock), 2);
});

test('寝られるのは 18:00 以降', () => {
  const g = createGame('テスト');
  const door = spotAt(DOOR.tx, DOOR.ty)!;
  assert.ok(optionsFor(g, door).find((o) => o.id === 'sleep')!.disabled);
  advance(g, at(1, 18) - g.clock);
  assert.equal(optionsFor(g, door).find((o) => o.id === 'sleep')!.disabled, null);
});

test('100日目の朝にドラゴン来訪のイベント', () => {
  const g = createGame('テスト');
  g.clock = at(TIME.ARRIVAL_DAY - 1, 23);
  const events = sleepUntilMorning(g);
  assert.ok(events.some((e) => e.kind === 'story' && e.id === 'arrival'));
});

// ---------------------------------------------------------------- 地形

test('扉は調べられ、川と木は通れない', () => {
  assert.equal(spotAt(DOOR.tx, DOOR.ty)?.kind, 'door');
  assert.equal(isBlocked(DOOR.tx, DOOR.ty + 1), false);
  assert.equal(isBlocked(5, 0), true);
});

// ---------------------------------------------------------------- 名前

test('名前はカタカナ1〜6文字', () => {
  assert.equal(isValidName('モクチャン'), true);
  assert.equal(isValidName('ヴァルコー'), true);
  assert.equal(isValidName(''), false);
  assert.equal(isValidName('アイウエオカキ'), false);
  assert.equal(isValidName('ronnie'), false);
  assert.equal(isValidName('ろに'), false);
  assert.equal(appendKana('アイウエオカ', 'キ'), 'アイウエオカ');
  assert.equal(backspace('ロニー'), 'ロニ');
});

test('文字盤はすべて1行10マスで、入っている文字は名前に使える', () => {
  for (const row of KANA_GRID) {
    assert.equal(row.length, 10);
    for (const c of row) if (c) assert.equal(isValidName(c), true, c);
  }
});

// ---------------------------------------------------------------- セーブ

test('セーブして読み込むと同じ状態に戻る', async () => {
  const store = new LocalSaveStore(new MemoryKeyValue());
  const g = createGame('ロニー');
  advance(g, 300);
  await store.save(newSaveFile('slot2', g, new Date('2026-11-16T00:00:00Z')));
  const loaded = await store.load('slot2');
  assert.deepEqual(loaded?.game, g);
  const list = await store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].playerName, 'ロニー');
  await store.remove('slot2');
  assert.equal(await store.load('slot2'), null);
});

test('古い・欠けたデータは初期値で補い、新しい版や壊れたデータは読まない', () => {
  const m = migrate({ schema: SAVE_SCHEMA, slotId: 'slot1', game: { playerName: 'ロニー', clock: 999 } });
  assert.equal(m?.game.clock, 999);
  assert.equal(m?.game.plots.length, plotTiles().length);
  assert.equal(migrate({ schema: SAVE_SCHEMA + 1, game: { playerName: 'ア', clock: 1 } }), null);
  assert.equal(migrate('broken'), null);
  assert.equal(migrate({ game: { clock: 1 } }), null);
});
