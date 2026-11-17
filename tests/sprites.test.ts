import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOKU, MOMO, PALETTE, PLAYER, SpriteDef, ZZZ } from '../src/view/sprites.js';

function check(name: string, def: SpriteDef): void {
  assert.equal(def.rows.length, def.h, `${name} の高さ`);
  for (const row of def.rows) {
    assert.equal(row.length, def.w, `${name} の幅`);
    for (const ch of row) if (ch !== '.') assert.ok(PALETTE[ch], `${name} に色の無い文字 ${ch}`);
  }
  assert.ok(def.rows.some((r) => r.includes('k')) || name === 'ZZZ', `${name} に輪郭がある`);
}

test('ドット絵はすべて四角く、パレットにある色だけを使う', () => {
  for (const [face, frames] of Object.entries(PLAYER)) frames.forEach((f, i) => check(`主人公 ${face}${i}`, f));
  for (const [k, f] of Object.entries(MOKU)) check(`モクちゃん ${k}`, f);
  for (const [k, f] of Object.entries(MOMO)) check(`ももっちゅ ${k}`, f);
  check('ZZZ', ZZZ);
});

test('主人公は 32x48、仲間は 32x32', () => {
  assert.equal(PLAYER.down[0].w, 32);
  assert.equal(PLAYER.down[0].h, 48);
  assert.equal(MOKU.idle.h, 32);
  assert.equal(MOMO.idle.h, 32);
});

test('歩きのコマは止まっている絵と違う', () => {
  assert.notDeepEqual(PLAYER.down[1].rows, PLAYER.down[0].rows);
  assert.notDeepEqual(PLAYER.side[1].rows, PLAYER.side[3].rows);
});
