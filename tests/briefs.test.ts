import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constraintsFromText, normalizeBrief } from '../src/lib/briefs';


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
