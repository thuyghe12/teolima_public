import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discovery, discoveryRefusal, TOPICS } from '../shared/board/discovery';
import { applyChange, type ChangeBody } from '../shared/board/changes';
import { emptyBoard, type Board } from '../shared/board/schema';
import { discovered, discoveryChanges } from './fixtures/support-board';

const at = '2026-11-19T12:00:00.000Z';
const record = (b: Board, body: ChangeBody, quote = 'as the user said it') => {
  const r = applyChange(b, { body, actor: 'coach', reason: 'test', at, basis: { source: 'user', quote } });
  assert.ok(r.ok, 'error' in r ? r.error : '');
  return r.board;
};

test('an empty specification misses every required topic, in order', () => {
  const d = discovery(emptyBoard());
  assert.equal(d.done, false);
  assert.deepEqual(d.missing.map((t) => t.id), ['problem', 'outcome', 'users', 'scenarios', 'systems', 'oversight', 'security']);
  assert.deepEqual(d.open.map((t) => t.id), ['reliability', 'cost', 'operations', 'performance']);
  assert.match(discoveryRefusal(d), /^Discovery is not done\. .*Problem \("What problem does this solve today/);
});

test('a topic is covered by a requirement of its kind, and quality topics by their pillar', () => {
  let b = emptyBoard();
  b = record(b, { op: 'record_requirement', kind: 'constraint', text: 'Budget of 2,000 EUR a month', pillar: 'cost-optimization' });
  b = record(b, { op: 'record_requirement', kind: 'nonfunctional', text: 'Answers within five seconds', pillar: 'performance-efficiency' });
  b = record(b, { op: 'record_requirement', kind: 'functional', text: 'Rebooks a cancelled delivery' });
  const d = discovery(b);
  const covered = d.topics.filter((t) => t.covered).map((t) => t.topic.id);
  assert.deepEqual(covered, ['scenarios', 'cost', 'performance']);
  assert.deepEqual(d.topics.find((t) => t.topic.id === 'cost')?.by, ['constraint-1']);
  // A constraint without a pillar covers no quality topic.
  b = record(b, { op: 'record_requirement', kind: 'constraint', text: 'Must use the existing CRM' });
  assert.equal(discovery(b).topics.find((t) => t.topic.id === 'security')?.covered, false);
});

test('design is refused until discovery is done; requirements are recorded before or after the brief', () => {
  const briefed = applyChange(emptyBoard(), { body: { op: 'set_brief', goal: 'Rebook deliveries' }, actor: 'user', reason: 'test', at });
  assert.ok(briefed.ok);
  const early = applyChange(briefed.board, { body: { op: 'set_shape', shape: 'single' }, actor: 'coach', reason: 'test', at });
  assert.ok('error' in early && /Discovery is not done/.test(early.error));
  assert.ok(discovery(discovered(emptyBoard())).done, 'requirements can come before the brief');
  const ready = applyChange(discovered(briefed.board), { body: { op: 'set_shape', shape: 'single' }, actor: 'coach', reason: 'test', at });
  assert.ok(ready.ok);
});

test('requirement ids are stable per kind, the same statement updates in place, and clearing the board keeps the specification', () => {
  let b = discovered(emptyBoard());
  assert.deepEqual(b.spec.requirements.map((r) => r.id), ['problem-1', 'outcome-1', 'user-1', 'scenario-1', 'integration-1', 'oversight-1', 'nonfunctional-1']);
  b = record(b, { op: 'record_requirement', kind: 'scenario', text: 'A customer asks where an order is and gets its status' }, 'a newer quote');
  assert.equal(b.spec.requirements.filter((r) => r.kind === 'scenario').length, 1);
  assert.equal(b.spec.requirements.find((r) => r.id === 'scenario-1')?.source.quote, 'a newer quote');
  b = record(b, { op: 'record_requirement', kind: 'scenario', text: 'A customer asks for a refund' });
  assert.equal(b.spec.requirements.at(-1)?.id, 'scenario-2');
  const cleared = applyChange({ ...b, brief: { goal: 'x', audience: '', constraints: [] } }, { body: { op: 'clear' }, actor: 'user', reason: 'test', at });
  assert.ok(cleared.ok && cleared.board.spec.requirements.length === b.spec.requirements.length);
  assert.equal(discoveryChanges.length, 7);
});

test('every topic names a question and the guidance it rests on', () => {
  for (const t of TOPICS) {
    assert.match(t.question, /\?$/, t.id);
    assert.ok(t.guidance.length > 0 && t.guidance.every((g) => g.startsWith('https://learn.microsoft.com/en-us/azure/well-architected/')), t.id);
  }
});

test('the specification document groups requirements, quotes every source and lists open questions', async () => {
  const { specMarkdown, grouped } = await import('../shared/board/spec-document');
  let b = discovered({ ...emptyBoard(), title: 'Customer support', brief: { goal: 'Answer order questions', audience: '', constraints: [] } });
  const r = applyChange(b, { body: { op: 'record_requirement', kind: 'constraint', text: 'Must run in West Europe' }, actor: 'coach', reason: 'test', at, basis: { source: 'document', document: 'doc-1', quote: 'west europe only' } });
  assert.ok(r.ok);
  b = r.board;
  const md = specMarkdown(b, { 'doc-1': 'Discovery call' });
  assert.match(md, /^# Functional specification: Customer support\n\n\*\*Goal:\*\* Answer order questions/);
  assert.match(md, /## Problem today\n\n- \*\*problem-1\*\* Customers wait days/);
  assert.match(md, /- \*\*nonfunctional-1\*\* Customer data stays in the EU \*\(Security\)\*\n  > "data stays in the EU" \(said in the session\)/);
  assert.match(md, /> "west europe only" \(Discovery call \(doc-1\)\)/);
  assert.match(md, /## Open questions\n\n- \*\*Reliability\*\*: How available must it be/);
  assert.doesNotMatch(md, /required before design/);
  assert.deepEqual(grouped(b).map((g) => g.kind), ['problem', 'outcome', 'user', 'scenario', 'oversight', 'integration', 'nonfunctional', 'constraint']);
  assert.match(specMarkdown(emptyBoard()), /\*\*Problem\*\* \(required before design\)/);
});
