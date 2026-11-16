import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { hasKanji, toKana } from '../src/core/kana.js';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

test('ひらがなモード：送りがなで読みを変える', () => {
  assert.equal(toKana('白のマナを炉に入れた。'), 'しろのマナをろにいれた。');
  assert.equal(toKana('小屋に入ってベッドを調べ'), 'こやにはいってベッドをしらべ');
  assert.equal(toKana('3日目 6:00'), '3にちめ 6:00');
  assert.equal(toKana('慰霊碑、つまり昔のお墓だな。'), 'いれいひ、つまりむかしのおはかだな。');
});

test('ひらがなモード：画面に出る文（ソースの文字列）に、漢字が残らない', () => {
  const left = new Set<string>();
  for (const f of files('src')) {
    for (const line of readFileSync(f, 'utf-8').split('\n')) {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      for (const m of line.matchAll(/'([^']*)'|`([^`]*)`/g)) {
        const s = m[1] ?? m[2] ?? '';
        const k = toKana(s);
        if (hasKanji(k)) left.add(`${f}: ${k}`);
      }
    }
  }
  assert.deepEqual([...left], []);
});
