import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayOf, formatClock, isNight, isPastBedtime, nextMorning, START_TIME } from '../src/core/clock.js';
import { AREAS, bridgeDeck, footFree, HOME, isBlockedAt, nearestFree, PLOTS, Spot, spotAt, WAKE } from '../src/core/map.js';
import { appendKana, backspace, isValidName, KANA_GRID } from '../src/core/names.js';
import { CROPS, FORGE, MINUTES_PER_DAY, TIME } from '../src/core/params.js';
import { LocalSaveStore, MemoryKeyValue } from '../src/core/save/localStore.js';
import { migrate, newSaveFile, SAVE_SCHEMA } from '../src/core/save/schema.js';
import { advance, checkBedtime, mokuAsleep, momoAsleep, sleepUntilMorning } from '../src/core/sim.js';
import { createGame } from '../src/core/state.js';
import { LOOK } from '../src/core/story.js';
import { optionsFor, runTask } from '../src/core/tasks.js';

const at = (day: number, h: number, m = 0) => (day - 1) * MINUTES_PER_DAY + h * 60 + m;
const plotSpot = (i: number): Spot => spotAt('village', (PLOTS[i].x0 + PLOTS[i].x1) / 2, (PLOTS[i].y0 + PLOTS[i].y1) / 2)!;
const forgeSpot = (): Spot => spotAt('smithy', 400, 200)!;
const bedSpot = (): Spot => spotAt('hut', 280, 220)!;

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
    runTask(g, plotSpot(0), 'till');
    runTask(g, plotSpot(0), 'plant:bean');
    runTask(g, forgeSpot(), 'feedForge');
  }
  advance(a, 3 * MINUTES_PER_DAY);
  for (let i = 0; i < 3 * MINUTES_PER_DAY; i++) advance(b, 1);
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------- 畑

test('豆は4属性のマナを毎朝1つずつ使って育ち、収穫できる', () => {
  const g = createGame('テスト');
  g.inv.mana.fire = 10;
  const spot = plotSpot(0);
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
  const spot = plotSpot(1);
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
  const forge = forgeSpot();
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
  g.inv.goods.wood = 10;
  const forge = forgeSpot();
  for (let i = 0; i < FORGE.CAPACITY; i++) runTask(g, forge, 'feedForge');
  const opt = optionsFor(g, forge).find((o) => o.id === 'feedForge')!;
  assert.equal(opt.disabled, '炉がいっぱい');
});

test('炉には燃料が要り、薪→毛→皮の順に使う', () => {
  const g = createGame('テスト');
  const forge = forgeSpot();
  g.inv.goods.wood = 1;
  g.inv.goods.hair = 1;
  runTask(g, forge, 'feedForge');
  assert.equal(g.inv.goods.wood, 0);
  runTask(g, forge, 'feedForge');
  assert.equal(g.inv.goods.hair, 0);
  const opt = optionsFor(g, forge).find((o) => o.id === 'feedForge')!;
  assert.equal(opt.disabled, '燃料（薪・毛・皮）がない');
  assert.equal(g.forge.queue.length, 2);
});

// ---------------------------------------------------------------- 仲間・イベント

test('モクちゃんは夜に眠り、ももっちゅは朝に眠る', () => {
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

test('深夜2時を過ぎると眠ってしまい、6:00 に小屋の中で目覚める', () => {
  const g = createGame('テスト');
  advance(g, at(2, 2) - g.clock);
  const events = checkBedtime(g);
  assert.ok(events.some((e) => e.kind === 'forcedSleep'));
  assert.equal(formatClock(g.clock), '6:00');
  assert.equal(dayOf(g.clock), 2);
  assert.equal(g.player.area, WAKE.area);
});

test('寝られるのは 18:00 以降', () => {
  const g = createGame('テスト');
  const door = bedSpot();
  assert.ok(optionsFor(g, door).find((o) => o.id === 'sleep')!.disabled);
  advance(g, at(1, 18) - g.clock);
  assert.equal(optionsFor(g, door).find((o) => o.id === 'sleep')!.disabled, null);
});

test('22時前に自分から寝たときは、起きた後に「眠くなっちゃった」の場面が出ない', () => {
  const g = createGame('テスト');
  advance(g, at(1, 20) - g.clock);
  const events = sleepUntilMorning(g);
  assert.ok(!events.some((e) => e.kind === 'story' && e.id === 'firstNight'));
});

test('100日目の朝にドラゴン来訪のイベント', () => {
  const g = createGame('テスト');
  g.clock = at(TIME.ARRIVAL_DAY - 1, 23);
  const events = sleepUntilMorning(g);
  assert.ok(events.some((e) => e.kind === 'story' && e.id === 'arrival'));
});

// ---------------------------------------------------------------- 地形

test('村：小屋と鍛冶小屋に入れ、畑の6区画と、慰霊碑・森の入口・荷車・噴水・ベンチ・海を調べられる', () => {
  assert.deepEqual(spotAt('village', 1015, 640), { kind: 'enter', id: 'hut' });
  assert.deepEqual(spotAt('village', 1578, 1130), { kind: 'enter', id: 'smithy' });
  for (let i = 0; i < PLOTS.length; i++) assert.equal(plotSpot(i).plot, i);
  const looks: [number, number, string][] = [
    [1785, 790, 'memorial'],
    [1530, 620, 'forestGate'],
    [1540, 782, 'cart'],
    [905, 838, 'fountain'],
    [1030, 886, 'bench'],
    [1000, 1460, 'sea'],
    [1640, 808, 'wastelandSign'],
    [500, 1020, 'waterBarrel'],
  ];
  for (const [x, y, id] of looks) {
    assert.deepEqual(spotAt('village', x, y), { kind: 'look', id }, id);
    // 調べる場所の前には立てる
    if (id !== 'fountain' && id !== 'sea') assert.equal(isBlockedAt('village', x, y), false, `${id} の前に立てる`);
  }
});

test('調べられる場所には、すべて説明の台詞がある', () => {
  for (const a of Object.values(AREAS))
    for (const s of a.spots) if (s.spot.kind === 'look') assert.ok(LOOK[s.spot.id!]?.length, s.spot.id);
});

test('室内：小屋はベッド・机・出口、鍛冶小屋は炉・出口', () => {
  assert.equal(spotAt('hut', 280, 220)?.kind, 'bed');
  assert.equal(spotAt('hut', 480, 260)?.kind, 'desk');
  assert.deepEqual(spotAt('hut', 400, 410), { kind: 'exit', id: 'village' });
  assert.equal(spotAt('smithy', 400, 200)?.kind, 'forge');
  assert.equal(isBlockedAt('hut', 400, 330), false);
  assert.equal(isBlockedAt('hut', 280, 220), true); // ベッド
  assert.equal(isBlockedAt('hut', 100, 300), true); // 壁の外
});

test('村：小屋の前・畑の中・浜辺・慰霊碑の前は歩け、川・噴水・森・畑の柵・石垣は通れない', () => {
  const v = (x: number, y: number) => isBlockedAt('village', x, y);
  assert.equal(v(HOME.x, HOME.y), false);
  assert.equal(v(1240, 700), false); // 畑の中
  assert.equal(v(1160, 790), false); // 畑の入口
  assert.equal(v(1000, 1380), false); // 浜辺
  assert.equal(v(250, 1050), false); // 橋
  assert.equal(v(1478, 640), false); // 慰霊碑の前
  assert.equal(v(320, 900), true); // 川
  assert.equal(v(905, 838), true); // 噴水
  assert.equal(v(1000, 400), true); // 森
  assert.equal(v(1250, 790), true); // 畑の前の柵
  assert.equal(v(700, 1230), true); // 石垣
});

test('保存した位置が通れない所の中でも、近くの立てる所から再開できる', () => {
  // 荒野の看板の柱の中（v0.5.2 で通れなくなった所）
  const p = nearestFree('village', 1650, 796);
  assert.ok(footFree('village', p.x, p.y));
  assert.ok(Math.hypot(p.x - 1650, p.y - 796) < 40);
  // 立てる所はそのまま
  assert.deepEqual(nearestFree('village', HOME.x, HOME.y), { x: HOME.x, y: HOME.y });
});

test('村：反り橋は床の線に沿って歩け、手前の欄干の上には乗れない', () => {
  const v = (x: number, y: number) => isBlockedAt('village', x, y);
  for (const x of [150, 200, 255, 300, 360]) {
    assert.equal(v(x, bridgeDeck(x) + 3), false, `橋の床 x=${x}`);
    assert.equal(v(x, bridgeDeck(x) + 22), true, `手前の欄干 x=${x}`);
  }
});

test('村：石垣の奥・岩の奥まで回り込め、荒野の立て札の上の木には入れない', () => {
  const v = (x: number, y: number) => isBlockedAt('village', x, y);
  assert.equal(v(620, 1196), false); // 西の石垣の奥
  assert.equal(v(1300, 1188), false); // 東の石垣の奥
  assert.equal(v(1240, 1028), false); // 広場の南東の岩の奥
  assert.equal(v(708, 1132), false); // 石垣の手前の岩の奥
  assert.equal(v(1240, 1046), true); // 岩の根元
  assert.equal(v(1640, 700), true); // 立て札の上の木
  assert.equal(v(1650, 760), false); // 立て札の奥
  assert.equal(v(1578, 1130), false); // 鍛冶小屋の入口の前
  assert.equal(v(1560, 1060), true); // 鍛冶小屋の中
  assert.equal(v(1030, 800), false); // ベンチの奥
  assert.equal(v(1030, 850), true); // ベンチの座面の下
  assert.equal(v(460, 1180), false); // 石垣の左端の奥の草むらの奥
  assert.equal(v(460, 1196), true); // 草むらの根元
  assert.equal(v(1644, 796), true); // 荒野の立て札の柱
  assert.equal(v(1676, 796), true); // 荒野の立て札の矢印の先の下
  assert.equal(v(550, 976), false); // 右の水樽の奥
  assert.equal(v(548, 1000), true); // 右の水樽の根元
  assert.equal(v(1400, 1100), false); // 鍛冶小屋の左下の岩の奥
  assert.equal(v(1400, 1125), true); // 同じ岩の根元
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
  assert.equal(m?.game.plots.length, PLOTS.length);
  assert.equal(m?.game.player.area, 'village'); // 版2以前はエリアが無い → 村
  // 版1のデータは、位置を小屋の前に戻し、畑の中身は残す
  const old = createGame('ロニー');
  old.player.x = 5;
  old.plots[2].stage = 'tilled';
  const m1 = migrate({ schema: 1, slotId: 'slot1', game: old });
  assert.equal(m1?.game.player.x, HOME.x);
  assert.equal(m1?.game.plots[2].stage, 'tilled');
  assert.equal(m1?.game.inv.goods.wood, createGame('ア').inv.goods.wood);
  assert.equal(migrate({ schema: SAVE_SCHEMA + 1, game: { playerName: 'ア', clock: 1 } }), null);
  assert.equal(migrate('broken'), null);
  assert.equal(migrate({ game: { clock: 1 } }), null);
});
