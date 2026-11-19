import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyChange, replay, type ChangeBody } from '../shared/board/changes';
import { emptyBoard, type Board } from '../shared/board/schema';
import { readiness } from '../shared/board/readiness';
import { approved, discovered, supportChanges } from './fixtures/support-board';

const apply = (b: Board, body: ChangeBody) => {
  const r = applyChange(b, { body, actor: 'coach', reason: 'test', at: new Date().toISOString() });
  assert.ok(r.ok, 'error' in r ? r.error : '');
  return r.board;
};
const status = (b: Board) => Object.fromEntries(readiness(b).steps.map((s) => [s.id, s.status]));

test('an empty board starts at discovery', () => {
  assert.equal(readiness(emptyBoard()).next?.id, 'discovery');
  assert.match(readiness(emptyBoard()).next!.detail, /set_brief/);
});

test('after the brief, discovery asks the missing topics; after discovery, single agent or several', () => {
  const briefed = apply(emptyBoard(), { op: 'set_brief', goal: 'Route tickets' });
  const next = readiness(briefed).next!;
  assert.equal(next.id, 'discovery');
  assert.match(next.detail, /What problem does this solve today/);
  const b = discovered(briefed);
  assert.equal(readiness(b).next?.id, 'shape');
  assert.match(readiness(b).steps[0].detail, /Still open, to confirm later: reliability, cost, operations, performance/);
});

test('one agent is the default: a second agent or a team is refused without a reason', () => {
  let b = approved(apply(emptyBoard(), { op: 'set_brief', goal: 'Route tickets' }));
  b = apply(b, { op: 'upsert_component', kind: 'agent', name: 'Router' });
  b = apply(b, { op: 'upsert_component', kind: 'agent', name: 'Router', instructions: 'updates are fine' });
  const second = applyChange(b, { body: { op: 'upsert_component', kind: 'agent', name: 'Billing' }, actor: 'coach', reason: 'test', at: new Date().toISOString() });
  assert.ok('error' in second && /set_shape/.test(second.error));
  const team = applyChange(b, { body: { op: 'upsert_team', name: 'T', pattern: 'sequential', members: ['Router'] }, actor: 'coach', reason: 'test', at: new Date().toISOString() });
  assert.equal(team.ok, false);
});

test('several agents need a stated reason; single is refused once there are several', () => {
  let b = approved(apply(emptyBoard(), { op: 'set_brief', goal: 'Route tickets' }));
  const noReason = applyChange(b, { body: { op: 'set_shape', shape: 'multi' }, actor: 'coach', reason: 'test', at: new Date().toISOString() });
  assert.equal(noReason.ok, false);
  b = apply(b, { op: 'set_shape', shape: 'multi', reasons: ['multiple_teams', 'multiple_teams'] });
  assert.deepEqual(b.shape, { kind: 'multi', reasons: ['multiple_teams'] });
  b = apply(b, { op: 'upsert_component', kind: 'agent', name: 'A' });
  b = apply(b, { op: 'upsert_component', kind: 'agent', name: 'B' });
  assert.equal(applyChange(b, { body: { op: 'set_shape', shape: 'single' }, actor: 'coach', reason: 'test', at: new Date().toISOString() }).ok, false);
});

test('clearing the board resets the shape but keeps the brief', () => {
  const b = apply(replay(emptyBoard(), supportChanges), { op: 'clear' });
  assert.equal(b.shape.kind, 'undecided');
  assert.ok(b.brief.goal);
});

test('the support board: every step done, evaluation later', () => {
  const r = readiness(replay(emptyBoard(), supportChanges));
  assert.deepEqual(r.steps.filter((s) => s.status !== 'done').map((s) => s.id), ['evaluation']);
  assert.equal(r.next, null);
});

test('a start agent or manager may route without tools of its own', () => {
  const s = status(replay(emptyBoard(), supportChanges));
  assert.equal(s.tools, 'done'); // Triage has no tools: it starts the handoff
});

test('guardrails: an agent without Prompt Shields is missing', () => {
  let b = approved(apply(emptyBoard(), { op: 'set_brief', goal: 'Answer questions' }));
  b = apply(b, { op: 'set_shape', shape: 'single' });
  b = apply(b, { op: 'upsert_component', kind: 'knowledge', name: 'Docs' });
  b = apply(b, { op: 'upsert_component', kind: 'agent', name: 'Helper', knowledge: ['Docs'] });
  assert.equal(status(b).guardrails, 'missing');
  b = apply(b, { op: 'upsert_component', kind: 'guardrail', name: 'Safety', controls: ['harm_filters'] });
  assert.equal(status(b).guardrails, 'missing');
  b = apply(b, { op: 'upsert_component', kind: 'guardrail', name: 'Safety', controls: ['prompt_shields', 'harm_filters'] });
  assert.equal(status(b).guardrails, 'done');
});

test('tools: unused tools and bare agents are open items', () => {
  let b = approved(apply(emptyBoard(), { op: 'set_brief', goal: 'Answer questions' }));
  b = apply(b, { op: 'set_shape', shape: 'single' });
  b = apply(b, { op: 'upsert_component', kind: 'tool', name: 'Search' });
  b = apply(b, { op: 'upsert_component', kind: 'agent', name: 'Helper' });
  const t = readiness(b).steps.find((s) => s.id === 'tools')!;
  assert.equal(t.status, 'open');
  assert.match(t.detail, /"Helper"/);
  assert.match(t.detail, /"Search"/);
});

test('single agent: no pattern needed', () => {
  let b = approved(apply(emptyBoard(), { op: 'set_brief', goal: 'Answer questions' }));
  b = apply(b, { op: 'set_shape', shape: 'single' });
  b = apply(b, { op: 'upsert_component', kind: 'agent', name: 'Helper' });
  assert.equal(status(b).pattern, 'done');
});
