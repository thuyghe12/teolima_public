import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, emptyBoard, slug } from '../shared/board/schema';
import { applyChange, replay, type Change, type ChangeBody } from '../shared/board/changes';
import { supportChanges } from './fixtures/support-board';

const at = '2026-11-18T12:00:00.000Z';
const ch = (body: ChangeBody, actor: Change['actor'] = 'coach'): Change => ({ body, actor, reason: 'test', at });

function apply(board: Board, body: ChangeBody) {
  const r = applyChange(board, ch(body));
  if ('error' in r) throw new Error(r.error);
  return r;
}

test('slugs are stable and safe', () => {
  assert.equal(slug('Refund Agent'), 'refund-agent');
  assert.equal(slug('  Café  Ops!! '), 'cafe-ops');
  assert.equal(slug('???'), 'item');
});

test('the same name updates one component instead of creating two', () => {
  let b = apply(emptyBoard(), { op: 'upsert_component', kind: 'agent', name: 'Refunds', instructions: 'v1' }).board;
  b = apply(b, { op: 'upsert_component', kind: 'agent', name: 'refunds', description: 'Prepares refunds' }).board;
  assert.equal(b.components.length, 1);
  const agent = b.components[0];
  assert.equal(agent.kind === 'agent' && agent.instructions, 'v1');
  assert.equal(agent.description, 'Prepares refunds');
});

test('a name already used by another kind is refused', () => {
  const b = apply(emptyBoard(), { op: 'upsert_component', kind: 'tool', name: 'Search' }).board;
  const r = applyChange(b, ch({ op: 'upsert_component', kind: 'agent', name: 'Search' }));
  assert.equal(r.ok, false);
});

test('references resolve by name and must exist with the right kind', () => {
  let b = apply(emptyBoard(), { op: 'upsert_component', kind: 'tool', name: 'Order lookup' }).board;
  const missing = applyChange(b, ch({ op: 'upsert_component', kind: 'agent', name: 'Orders', tools: ['Refund API'] }));
  assert.equal(missing.ok, false);
  b = apply(b, { op: 'upsert_component', kind: 'agent', name: 'Orders', tools: ['Order lookup'] }).board;
  const agent = b.components.find((c) => c.id === 'orders');
  assert.deepEqual(agent?.kind === 'agent' && agent.tools, ['order-lookup']);
});

test('an approval can only gate a tool or an agent', () => {
  const b = apply(emptyBoard(), { op: 'upsert_component', kind: 'knowledge', name: 'Docs' }).board;
  assert.equal(applyChange(b, ch({ op: 'upsert_component', kind: 'approval', name: 'Gate', gates: 'Docs' })).ok, false);
});

test('the support fixture builds a valid board', () => {
  const b = replay(emptyBoard(), supportChanges);
  assert.equal(Board.safeParse(b).success, true);
  assert.equal(b.components.length, 11);
  assert.equal(b.teams.length, 1);
  assert.equal(b.teams[0].startAgent, 'triage');
  assert.deepEqual(b.connections.map((c) => c.id), ['customer-message--triage', 'support-desk--reply-to-customer']);
});

test('removing an agent cascades through teams, connections, guardrails and approvals', () => {
  let b = replay(emptyBoard(), supportChanges);
  b = apply(b, { op: 'upsert_component', kind: 'guardrail', name: 'Safety', appliesTo: ['Refunds', 'Triage'] }).board;
  b = apply(b, { op: 'upsert_component', kind: 'approval', name: 'Refund sign-off', gates: 'Refunds' }).board;
  b = apply(b, { op: 'remove_component', ref: 'Refunds' }).board;
  assert.ok(!b.components.some((c) => c.id === 'refunds' || c.id === 'refund-sign-off'));
  assert.ok(!b.teams[0].members.includes('refunds'));
  const g = b.components.find((c) => c.id === 'safety');
  assert.deepEqual(g?.kind === 'guardrail' && g.appliesTo, ['triage']);
});

test('removing a tool removes it from agents and drops approvals that gated it', () => {
  let b = replay(emptyBoard(), supportChanges);
  b = apply(b, { op: 'remove_component', ref: 'Refund API' }).board;
  const refunds = b.components.find((c) => c.id === 'refunds');
  assert.deepEqual(refunds?.kind === 'agent' && refunds.tools, []);
  assert.ok(!b.components.some((c) => c.id === 'refund-approval'));
});

test('team members must be agents and an agent belongs to one team', () => {
  let b = replay(emptyBoard(), supportChanges);
  assert.equal(applyChange(b, ch({ op: 'upsert_team', name: 'Bad', pattern: 'sequential', members: ['Refund API'] })).ok, false);
  const r = applyChange(b, ch({ op: 'upsert_team', name: 'Second', pattern: 'concurrent', members: ['Policy'] }));
  assert.equal(r.ok, false);
  assert.match('error' in r ? r.error : '', /already in team/);
});

test('team patterns warn about missing managers and start agents', () => {
  let b = emptyBoard();
  for (const name of ['A', 'B']) b = apply(b, { op: 'upsert_component', kind: 'agent', name }).board;
  const magentic = apply(b, { op: 'upsert_team', name: 'T', pattern: 'magentic', members: ['A', 'B'] });
  assert.match(magentic.warnings.join(' '), /manager/);
  const handoff = apply(b, { op: 'upsert_team', name: 'T', pattern: 'handoff', members: ['A', 'B'] });
  assert.match(handoff.warnings.join(' '), /start agent/);
  assert.equal(applyChange(b, ch({ op: 'upsert_team', name: 'T', pattern: 'handoff', members: ['A'], startAgent: 'B' })).ok, false);
});

test('connections are unique, need both ends and cannot loop to themselves', () => {
  let b = replay(emptyBoard(), supportChanges);
  b = apply(b, { op: 'connect', from: 'Customer message', to: 'Triage', label: 'chat message' }).board;
  assert.equal(b.connections.length, 2);
  assert.equal(b.connections[0].label, 'chat message');
  assert.equal(applyChange(b, ch({ op: 'connect', from: 'Triage', to: 'Triage' })).ok, false);
  assert.equal(applyChange(b, ch({ op: 'connect', from: 'Triage', to: 'Nobody' })).ok, false);
  b = apply(b, { op: 'disconnect', from: 'Customer message', to: 'Triage' }).board;
  assert.equal(b.connections.length, 1);
});

test('removing a team removes its connections; team and component names cannot collide', () => {
  let b = replay(emptyBoard(), supportChanges);
  assert.equal(applyChange(b, ch({ op: 'upsert_component', kind: 'agent', name: 'Support desk' })).ok, false);
  assert.equal(applyChange(b, ch({ op: 'upsert_team', name: 'Triage', pattern: 'sequential', members: ['Policy'] })).ok, false);
  b = apply(b, { op: 'remove_team', ref: 'Support desk' }).board;
  assert.deepEqual(b.connections.map((c) => c.id), ['customer-message--triage']);
});

test('changes need a known actor and a reason', () => {
  const bad = { body: { op: 'set_title', title: 'x' }, actor: 'someone', reason: 'r', at } as unknown as Change;
  assert.equal(applyChange(emptyBoard(), bad).ok, false);
  assert.equal(applyChange(emptyBoard(), { ...ch({ op: 'set_title', title: 'x' }), reason: '' }).ok, false);
  assert.equal(applyChange(emptyBoard(), ch({ op: 'set_title', title: 'x' }, 'worker:constraints')).ok, true);
});

test('replay is deterministic and a refused change leaves the board unchanged', () => {
  const a = replay(emptyBoard(), supportChanges);
  const b = replay(emptyBoard(), supportChanges);
  assert.deepEqual(a, b);
  const refused = applyChange(a, ch({ op: 'remove_component', ref: 'Nothing' }));
  assert.equal(refused.ok, false);
});

test('clear empties the board but keeps its title', () => {
  const b = apply(replay(emptyBoard(), supportChanges), { op: 'clear' }).board;
  assert.deepEqual([b.components.length, b.teams.length, b.connections.length, b.title], [0, 0, 0, 'Customer support']);
});
