import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, emptyBoard, slug } from '../shared/board/schema';
import { applyChange, replay, type Change, type ChangeBody } from '../shared/board/changes';
import { briefedBoard, supportChanges } from './fixtures/support-board';

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
  let b = apply(briefedBoard(), { op: 'upsert_component', kind: 'agent', name: 'Refunds', instructions: 'v1' }).board;
  b = apply(b, { op: 'upsert_component', kind: 'agent', name: 'refunds', description: 'Prepares refunds' }).board;
  assert.equal(b.components.length, 1);
  const agent = b.components[0];
  assert.equal(agent.kind === 'agent' && agent.instructions, 'v1');
  assert.equal(agent.description, 'Prepares refunds');
});

test('a name already used by another kind is refused', () => {
  const b = apply(briefedBoard(), { op: 'upsert_component', kind: 'tool', name: 'Search' }).board;
  const r = applyChange(b, ch({ op: 'upsert_component', kind: 'agent', name: 'Search' }));
  assert.equal(r.ok, false);
});

test('references resolve by name and must exist with the right kind', () => {
  let b = apply(briefedBoard(), { op: 'upsert_component', kind: 'tool', name: 'Order lookup' }).board;
  const missing = applyChange(b, ch({ op: 'upsert_component', kind: 'agent', name: 'Orders', tools: ['Refund API'] }));
  assert.equal(missing.ok, false);
  b = apply(b, { op: 'upsert_component', kind: 'agent', name: 'Orders', tools: ['Order lookup'] }).board;
  const agent = b.components.find((c) => c.id === 'orders');
  assert.deepEqual(agent?.kind === 'agent' && agent.tools, ['order-lookup']);
});

test('an approval can only gate a tool or an agent', () => {
  const b = apply(briefedBoard(), { op: 'upsert_component', kind: 'knowledge', name: 'Docs' }).board;
  assert.equal(applyChange(b, ch({ op: 'upsert_component', kind: 'approval', name: 'Gate', gates: 'Docs' })).ok, false);
});

test('the support fixture builds a valid board', () => {
  const b = replay(emptyBoard(), supportChanges);
  assert.equal(Board.safeParse(b).success, true);
  assert.equal(b.components.length, 11);
  assert.equal(b.brief.constraints[0], 'Refunds over 100 EUR need a person');
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
  let b = briefedBoard();
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
  assert.equal(b.brief.goal, 'Answer order questions and handle refunds safely', 'the brief survives a clear');
});

test('nothing can be built during discovery', () => {
  const r = applyChange(emptyBoard(), ch({ op: 'upsert_component', kind: 'agent', name: 'Eager' }));
  assert.ok('error' in r && /belongs to solution design, and the current stage is discovery/.test(r.error));
  assert.equal(applyChange(emptyBoard(), ch({ op: 'connect', from: 'a', to: 'b' })).ok, false);
  assert.equal(applyChange(emptyBoard(), ch({ op: 'set_title', title: 'Fine' })).ok, true);
});

test('a brief needs a goal, and later edits keep what they do not change', () => {
  assert.equal(applyChange(emptyBoard(), ch({ op: 'set_brief', audience: 'Agents' })).ok, false);
  let b = apply(emptyBoard(), { op: 'set_brief', goal: 'Route tickets', constraints: ['EU data only'] }).board;
  b = apply(b, { op: 'set_brief', audience: 'Support staff' }).board;
  assert.deepEqual(b.brief, { goal: 'Route tickets', audience: 'Support staff', constraints: ['EU data only'] });
});

test('memory: agents reference it, defaults are explicit, removal cascades', () => {
  let b = apply(briefedBoard(), { op: 'upsert_component', kind: 'memory', name: 'Customer memory', scope: 'user', store: 'cosmos_db' }).board;
  b = apply(b, { op: 'upsert_component', kind: 'agent', name: 'Support', memory: ['Customer memory'], history: 'client' }).board;
  const agent = b.components.find((c) => c.id === 'support');
  assert.ok(agent?.kind === 'agent');
  if (agent?.kind !== 'agent') return;
  assert.deepEqual(agent.memory, ['customer-memory']);
  assert.equal(agent.history, 'client');
  const mem = b.components.find((c) => c.id === 'customer-memory');
  assert.ok(mem?.kind === 'memory' && mem.scope === 'user' && mem.store === 'cosmos_db');
  b = apply(b, { op: 'remove_component', ref: 'Customer memory' }).board;
  const after = b.components.find((c) => c.id === 'support');
  assert.ok(after?.kind === 'agent' && after.memory.length === 0);
});

test('memory refs must point at memory, and stores and scopes are fixed lists', () => {
  const b = apply(briefedBoard(), { op: 'upsert_component', kind: 'tool', name: 'Search' }).board;
  assert.equal(applyChange(b, ch({ op: 'upsert_component', kind: 'agent', name: 'A', memory: ['Search'] })).ok, false);
  assert.equal(applyChange(b, ch({ op: 'upsert_component', kind: 'memory', name: 'M', store: 'postgres' })).ok, false);
  assert.equal(applyChange(b, ch({ op: 'upsert_component', kind: 'memory', name: 'M', scope: 'forever' })).ok, false);
});

test('an agent keeps its history in the service unless stated; A2A is a tool type', () => {
  let b = apply(briefedBoard(), { op: 'upsert_component', kind: 'agent', name: 'Plain' }).board;
  b = apply(b, { op: 'upsert_component', kind: 'tool', name: 'Billing agent', toolType: 'a2a' }).board;
  const plain = b.components.find((c) => c.id === 'plain');
  assert.ok(plain?.kind === 'agent' && plain.history === 'service' && plain.memory.length === 0);
  assert.ok(b.components.some((c) => c.kind === 'tool' && c.toolType === 'a2a'));
});
