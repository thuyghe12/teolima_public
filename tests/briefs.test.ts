import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constraintsFromText, normalizeBrief, recentBriefs, rememberBrief } from '../src/lib/briefs';

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

test('constraints: one per line, bullets and blanks dropped, capped at 12', () => {
  assert.deepEqual(constraintsFromText('- EU data only\n\n* No refunds over 100 EUR \n'), ['EU data only', 'No refunds over 100 EUR']);
  assert.equal(constraintsFromText(Array.from({ length: 20 }, (_, i) => `c${i}`).join('\n')).length, 12);
});

test('a brief is trimmed and capped to the server limits', () => {
  const b = normalizeBrief({ goal: ` ${'g'.repeat(700)} `, audience: '  staff ', constraints: [' a ', '', 'b'] });
  assert.equal(b.goal.length, 600);
  assert.equal(b.audience, 'staff');
  assert.deepEqual(b.constraints, ['a', 'b']);
});

test('recent briefs: newest first, same goal replaced, five kept', () => {
  const store = memory();
  for (let i = 0; i < 7; i++) rememberBrief({ goal: `Goal ${i}`, audience: '', constraints: [] }, store);
  rememberBrief({ goal: 'goal 3', audience: 'Support staff', constraints: [] }, store);
  const recent = recentBriefs(store);
  assert.equal(recent.length, 5);
  assert.equal(recent[0].goal, 'goal 3');
  assert.equal(recent[0].audience, 'Support staff');
  assert.equal(recent.filter((b) => b.goal.toLowerCase() === 'goal 3').length, 1);
});

test('a brief without a goal is not remembered', () => {
  const store = memory();
  rememberBrief({ goal: '  ', audience: 'x', constraints: [] }, store);
  assert.deepEqual(recentBriefs(store), []);
});

test('unreadable storage is ignored, not trusted', () => {
  const store = memory();
  store.setItem('teolima.recentBriefs', '{not json');
  assert.deepEqual(recentBriefs(store), []);
  store.setItem('teolima.recentBriefs', JSON.stringify([{ goal: 1 }, { goal: 'Ok', audience: '', constraints: ['a'] }]));
  assert.deepEqual(recentBriefs(store).map((b) => b.goal), ['Ok']);
  assert.deepEqual(recentBriefs(null), []);
});
