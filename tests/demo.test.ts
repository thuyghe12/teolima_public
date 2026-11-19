import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_SCRIPT, DEMO_USER_WORDS, playDemo, type DemoStep } from '../server/demo';
import { quoteFound } from '../server/guard/provenance';
import { emptyBoard } from '../shared/board/schema';
import { applyChange, type Change } from '../shared/board/changes';
import { layoutBoard } from '../shared/board/layout';
import { assertClean } from './helpers/layout';
import { gate } from '../shared/board/stages';

const at = '2026-11-18T12:00:00.000Z';

function replayDemo() {
  let board = emptyBoard();
  for (const step of DEMO_SCRIPT) {
    if (!('change' in step)) continue;
    const change: Change = { body: step.change, actor: step.actor ?? 'coach', reason: step.reason, at, ...(step.basis ? { basis: step.basis } : {}) };
    const r = applyChange(board, change);
    assert.ok(!('error' in r), `demo step refused: ${'error' in r ? r.error : ''}`);
    if ('board' in r) board = r.board;
  }
  return board;
}

test('every demo change is accepted by the change log', () => {
  replayDemo();
});

test('the demo runs discovery first, and every item quotes what the user said', () => {
  const b = replayDemo();
  const approval = DEMO_SCRIPT.findIndex((s) => 'change' in s && s.change.op === 'approve_stage');
  const firstDesign = DEMO_SCRIPT.findIndex((s) => 'change' in s && s.change.op === 'upsert_component');
  const discoveryItems = DEMO_SCRIPT.flatMap((s, i) => ('change' in s && s.change.op === 'record_item' && ['1.1', '1.2', '1.3', '2', '3.1', '3.2'].includes(s.change.section) ? [i] : []));
  assert.ok(Math.max(...discoveryItems) < approval && approval < firstDesign, 'discovery is approved before design starts');
  assert.ok(b.spec.items.length >= 9);
  const said = DEMO_USER_WORDS.join('\n');
  for (const i of b.spec.items) assert.ok(quoteFound(i.source.quote ?? '', said), `${i.id} quotes the user: "${i.source.quote}"`);
});

test('the demo builds a handoff team with an approval and a guardrail', () => {
  const b = replayDemo();
  assert.equal(b.teams[0].pattern, 'handoff');
  assert.ok(b.components.some((c) => c.kind === 'approval'));
  assert.ok(b.components.some((c) => c.kind === 'guardrail'));
});

test('the demo passes each gate: solution design is approved, technical design is ready to approve', () => {
  const b = replayDemo();
  assert.equal(b.stage.current, 'technical');
  assert.deepEqual(b.stage.approvals.map((a) => a.stage), ['discovery', 'solution']);
  assert.deepEqual(gate(b, 'technical').missing, []);
  assert.equal(b.spec.scenarios.length, 1);
  assert.deepEqual(b.spec.items.filter((i) => i.type === 'decision').map((i) => i.topic).sort(), ['complexity', 'hosting', 'pattern', 'platform']);
  assert.equal(b.spec.reviews.length, 59);
  const said = DEMO_USER_WORDS.join('\n');
  for (const r of b.spec.reviews) assert.ok(quoteFound(r.source.quote ?? '', said), `${r.code} quotes the user`);
  // an honest first review: what was not discussed stays open, with its reason
  assert.ok(b.spec.reviews.filter((r) => r.status === 'met').length < 20);
  for (const r of b.spec.reviews.filter((r) => r.status !== 'met')) assert.ok(r.note, r.code);
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
