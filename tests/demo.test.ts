import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_SCRIPT, playDemo, type DemoStep } from '../server/demo';
import { emptyBoard } from '../shared/board/schema';
import { applyChange, type Change } from '../shared/board/changes';
import { layoutBoard } from '../shared/board/layout';
import { assertClean } from './helpers/layout';

const at = '2026-11-18T12:00:00.000Z';

function replayDemo() {
  let board = emptyBoard();
  for (const step of DEMO_SCRIPT) {
    if (!('change' in step)) continue;
    const change: Change = { body: step.change, actor: 'coach', reason: step.reason, at };
    const r = applyChange(board, change);
    assert.ok(!('error' in r), `demo step refused: ${'error' in r ? r.error : ''}`);
    if ('board' in r) board = r.board;
  }
  return board;
}

test('every demo change is accepted by the change log', () => {
  replayDemo();
});

test('the demo builds a handoff team with an approval and a guardrail', () => {
  const b = replayDemo();
  assert.equal(b.teams[0].pattern, 'handoff');
  assert.ok(b.components.some((c) => c.kind === 'approval'));
  assert.ok(b.components.some((c) => c.kind === 'guardrail'));
});

test('the demo board lays out cleanly', () => {
  assertClean(layoutBoard(replayDemo()));
});

test('the coach narrates before each new part of the design', () => {
  assert.ok('say' in DEMO_SCRIPT[0]);
  assert.ok('say' in DEMO_SCRIPT.at(-1)!);
  assert.ok(DEMO_SCRIPT.filter((s) => 'say' in s).length >= 6);
});

test('playback runs the steps in order and can be stopped', async () => {
  const seen: DemoStep[] = [];
  const stop = playDemo((s) => seen.push(s), 1);
  await new Promise((r) => setTimeout(r, 900));
  stop();
  const count = seen.length;
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(seen.length, count, 'no steps after stop');
  assert.ok(count > 0);
  assert.deepEqual(seen, DEMO_SCRIPT.slice(0, count));
});
