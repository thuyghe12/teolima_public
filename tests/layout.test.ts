import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard, type Board } from '../shared/board/schema';
import { applyChange, replay, type ChangeBody } from '../shared/board/changes';
import { layoutBoard, fit, type Layout } from '../shared/board/layout';
import { assertClean, inside, onBorder } from './helpers/layout';
import { supportChanges } from './fixtures/support-board';

const at = '2026-11-18T12:00:00.000Z';
function build(bodies: ChangeBody[]): Board {
  return bodies.reduce((b, body) => {
    const r = applyChange(b, { body, actor: 'coach', reason: 'test', at });
    if ('error' in r) throw new Error(r.error);
    return r.board;
  }, emptyBoard());
}
const agents = (names: string[]): ChangeBody[] => names.map((name) => ({ op: 'upsert_component', kind: 'agent', name }));
const node = (l: Layout, id: string) => {
  const n = l.nodes.find((x) => x.id === id);
  assert.ok(n, `node ${id} is laid out`);
  return n!;
};

test('fit keeps whole words and marks a cut', () => {
  assert.equal(fit('Short', 40), 'Short');
  assert.equal(fit('Classifies intent and urgency for every incoming message', 30), 'Classifies intent and urgency…');
});

test('the support board: triggers left, team in the middle, outputs right, nothing overlaps or crosses', () => {
  const b = replay(emptyBoard(), supportChanges);
  const l = layoutBoard(b);
  assertClean(l);
  const team = l.teams.find((t) => t.id === 'support-desk')!;
  assert.equal(team.label, 'HANDOFF · Support desk');
  for (const id of ['triage', 'order-status', 'refunds', 'policy', 'order-lookup', 'refund-api', 'policy-docs', 'refund-approval']) {
    assert.ok(inside(node(l, id), team), `${id} sits inside its team`);
  }
  assert.ok(node(l, 'customer-message').x + 210 < team.x);
  assert.ok(node(l, 'reply-to-customer').x > team.x + team.w);
  assert.ok(node(l, 'safety').y + 120 <= team.y, 'guardrails sit above the team');
  const flow = l.edges.find((e) => e.id === 'customer-message--triage')!;
  assert.ok(onBorder(flow.points[0], node(l, 'customer-message')));
  assert.ok(onBorder(flow.points.at(-1)!, node(l, 'triage')));
  assert.equal(l.title?.text, 'Customer support');
});

test('the approval sits next to the tool it gates', () => {
  const l = layoutBoard(replay(emptyBoard(), supportChanges));
  const approval = node(l, 'refund-approval');
  const tool = node(l, 'refund-api');
  assert.equal(approval.y, tool.y);
  assert.ok(approval.x < tool.x);
  assert.ok(l.edges.some((e) => e.kind === 'approval' && e.id.endsWith('refund-approval!refund-api')));
});

test('sequential agents sit in a row in execution order', () => {
  const b = build([...agents(['Draft', 'Review', 'Publish']), { op: 'upsert_team', name: 'Pipeline', pattern: 'sequential', members: ['Review', 'Draft', 'Publish'] }]);
  const l = layoutBoard(b);
  assertClean(l);
  const [r, d, p] = ['review', 'draft', 'publish'].map((id) => node(l, id));
  assert.ok(r.x < d.x && d.x < p.x && r.y === d.y && d.y === p.y);
  assert.equal(l.edges.filter((e) => e.kind === 'pattern').length, 2);
});

test('concurrent agents share a column and fan out and back in', () => {
  const b = build([...agents(['A', 'B', 'C']), { op: 'upsert_team', name: 'Fan', pattern: 'concurrent', members: ['A', 'B', 'C'] }]);
  const l = layoutBoard(b);
  assertClean(l);
  const [a, bb, c] = ['a', 'b', 'c'].map((id) => node(l, id));
  assert.ok(a.x === bb.x && bb.x === c.x && a.y < bb.y && bb.y < c.y);
  assert.equal(l.edges.filter((e) => e.kind === 'pattern').length, 6);
});

test('group chat and magentic place the manager above the participants', () => {
  for (const pattern of ['group_chat', 'magentic'] as const) {
    const b = build([...agents(['Lead', 'Writer', 'Critic']), { op: 'upsert_team', name: 'Room', pattern, members: ['Writer', 'Critic'], manager: 'Lead' }]);
    const l = layoutBoard(b);
    assertClean(l);
    const lead = node(l, 'lead');
    assert.equal(lead.role, 'manager');
    assert.ok(lead.y + 120 < node(l, 'writer').y);
    assert.ok(l.teams[0].label.startsWith(pattern === 'magentic' ? 'MAGENTIC' : 'GROUP CHAT'));
  }
});

test('agents without a team and resources used by nobody are still placed', () => {
  const b = build([...agents(['Solo']), { op: 'upsert_component', kind: 'tool', name: 'Unused tool' }]);
  const l = layoutBoard(b);
  assertClean(l);
  assert.equal(l.teams[0].pattern, 'none');
  node(l, 'solo');
  node(l, 'unused-tool');
});

test('layout is deterministic', () => {
  const b = replay(emptyBoard(), supportChanges);
  assert.deepEqual(layoutBoard(b), layoutBoard(b));
});

test('an empty board lays out to nothing', () => {
  const l = layoutBoard(emptyBoard());
  assert.deepEqual([l.nodes.length, l.teams.length, l.edges.length, l.title], [0, 0, 0, null]);
});
