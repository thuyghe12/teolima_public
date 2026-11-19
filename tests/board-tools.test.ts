import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_TOOLS, BoardSession, boardToolDeclarations, toChangeBody } from '../server/board-tools';
import { approveDiscovery, discoveryChanges } from './fixtures/support-board';

const discover = (s: BoardSession) => {
  for (const c of discoveryChanges) s.apply(c.body, 'coach', c.reason, c.basis);
  s.apply(approveDiscovery.body, 'user', 'Approved in the app');
};

const briefed = () => {
  const s = new BoardSession();
  s.apply(toChangeBody('set_brief', { goal: 'Test system' })!, 'user', 'test');
  discover(s);
  s.apply({ op: 'set_shape', shape: 'multi', reasons: ['multiple_teams'] }, 'user', 'test');
  return s;
};

test('every board tool maps onto a change body', () => {
  assert.equal(BOARD_TOOLS.size, boardToolDeclarations.length);
  for (const name of BOARD_TOOLS) assert.ok(toChangeBody(name, { name: 'x', title: 'x', from: 'a', to: 'b', kind: 'agent', pattern: 'sequential', members: ['x'] }), name);
  assert.equal(toChangeBody('draw_shape'), null);
});

test('a session builds a board from tool calls, using snake_case arguments', () => {
  const s = briefed();
  const run = (name: string, args: Record<string, unknown>) => {
    const r = s.apply(toChangeBody(name, args)!, 'coach', String(args.reason ?? 'test'));
    assert.ok(!('error' in r), 'error' in r ? r.error : '');
    return r;
  };
  run('add_component', { kind: 'tool', name: 'Refund API', tool_type: 'openapi' });
  run('add_component', { kind: 'agent', name: 'Refunds', tools: ['Refund API'] });
  run('add_component', { kind: 'agent', name: 'Triage' });
  run('set_team', { name: 'Desk', pattern: 'handoff', members: ['Triage', 'Refunds'], start_agent: 'Triage' });
  run('add_component', { kind: 'approval', name: 'Sign-off', gates: 'Refund API', condition: 'over 100 EUR' });
  run('add_component', { kind: 'guardrail', name: 'Safety', controls: ['prompt_shields'], applies_to: ['Triage'] });
  const summary = s.summary();
  assert.deepEqual(summary.teams, ['Desk: handoff [Triage, Refunds]']);
  assert.equal(s.changes.length, 9 + discoveryChanges.length);
  assert.ok(s.changes.slice(3 + discoveryChanges.length).every((c) => c.actor === 'coach'));
});

test('a refused change leaves the session untouched and explains why', () => {
  const s = briefed();
  const r = s.apply(toChangeBody('set_team', { name: 'T', pattern: 'sequential', members: ['Ghost'] })!, 'coach', 'test');
  assert.ok('error' in r && /not on the board/.test(r.error));
  assert.equal(s.changes.length, 3 + discoveryChanges.length);
});

test('an invalid enum from the model is refused, not stored', () => {
  const s = briefed();
  const r = s.apply(toChangeBody('add_component', { kind: 'tool', name: 'X', tool_type: 'teleporter' })!, 'coach', 'test');
  assert.ok('error' in r);
});

test('a missing reason is recorded as such, never blank', () => {
  const s = briefed();
  s.apply(toChangeBody('set_title', { title: 'T' })!, 'coach', '  ');
  assert.equal(s.changes.at(-1)?.reason, 'No reason given');
});

test('connection summaries name teams as well as components', () => {
  const s = briefed();
  for (const [name, args] of [
    ['add_component', { kind: 'agent', name: 'A' }],
    ['set_team', { name: 'Team', pattern: 'sequential', members: ['A'] }],
    ['add_component', { kind: 'output', name: 'Out' }],
    ['connect', { from: 'Team', to: 'Out', label: 'result' }],
  ] as const) s.apply(toChangeBody(name, args)!, 'coach', 'test');
  assert.deepEqual(s.summary().connections, ['Team -> Out (result)']);
});

test('the coach cannot clear the board; only the user can', () => {
  assert.ok(!BOARD_TOOLS.has('clear_board'));
  const s = briefed();
  s.apply(toChangeBody('add_component', { kind: 'agent', name: 'A' })!, 'coach', 'test');
  const r = s.apply({ op: 'clear' }, 'user', 'Cleared from the toolbar');
  assert.ok(!('error' in r));
  assert.equal(s.board.components.length, 0);
  assert.equal(s.changes.at(-1)?.actor, 'user');
});

test('a new session restores the board the browser kept, once and only if valid', () => {
  const first = briefed();
  first.apply(toChangeBody('add_component', { kind: 'agent', name: 'Keeper' })!, 'coach', 'test');
  const second = new BoardSession();
  assert.equal(second.restore({ nonsense: true }), false);
  assert.equal(second.restore(first.board), true);
  assert.deepEqual(second.board, first.board);
  assert.equal(second.restore({ version: 1, title: '', components: [], teams: [], connections: [] }), false, 'a non-empty board is never overwritten');
});

test('the coach saves a brief and runs discovery; design starts only after the user approves discovery', () => {
  const s = new BoardSession();
  const early = s.apply(toChangeBody('add_component', { kind: 'agent', name: 'Eager' })!, 'coach', 'test');
  assert.ok('error' in early && /current stage is discovery/.test(early.error));
  const brief = s.apply(toChangeBody('set_brief', { goal: 'Route support tickets', audience: 'Support staff', constraints: ['EU data only'] })!, 'coach', 'Confirmed with the user');
  assert.ok(!('error' in brief));
  assert.deepEqual(s.summary().brief, { goal: 'Route support tickets', audience: 'Support staff', constraints: ['EU data only'] });
  assert.equal(s.summary().discovery.done, false);
  assert.match(s.summary().stage.gate, /not ready.*goals/);
  for (const c of discoveryChanges) s.apply(c.body, 'coach', c.reason, c.basis);
  assert.deepEqual(s.summary().discovery, { done: true, open_topics: ['Out of scope', 'Reliability', 'Performance', 'Cost', 'Operations', 'Rollout'] });
  assert.match(s.summary().stage.gate, /ready for the user to approve/);
  // The coach cannot approve, and cannot design before the user does.
  const self = s.apply(approveDiscovery.body, 'coach', 'test');
  assert.ok('error' in self && /Only a person can approve/.test(self.error));
  assert.ok('error' in s.apply(toChangeBody('add_component', { kind: 'agent', name: 'Triage' })!, 'coach', 'test'));
  assert.ok(!('error' in s.apply(approveDiscovery.body, 'user', 'Approved in the app')));
  assert.equal(s.summary().stage.current, 'Solution design');
  assert.ok(!('error' in s.apply(toChangeBody('add_component', { kind: 'agent', name: 'Triage' })!, 'coach', 'test')));
  // The approved specification is frozen until the user reopens discovery.
  const late = s.apply(toChangeBody('record_item', { section: '1.3', type: 'stakeholder', name: 'Auditors', text: 'Review the logs' })!, 'coach', 'test', { source: 'user', quote: 'auditors too' });
  assert.ok('error' in late && /discovery, which is approved/.test(late.error));
});

test('record_item maps its arguments, and an item from the coach needs its quoted source', () => {
  const s = new BoardSession();
  const body = toChangeBody('record_item', { section: '2', type: 'constraint', category: 'regulatory', text: 'Data stays in the EU' })!;
  assert.deepEqual(body, { op: 'record_item', id: undefined, section: '2', type: 'constraint', text: 'Data stays in the EU', name: undefined, attribute: undefined, category: 'regulatory', measure: undefined, serves: undefined, topic: undefined, options: undefined, consequences: undefined });
  const noSource = s.apply(body, 'coach', 'test');
  assert.ok('error' in noSource && /needs its source/.test(noSource.error));
  assert.ok(!('error' in s.apply(body, 'coach', 'test', { source: 'document', document: 'doc-1', quote: 'all data must stay in the EU' })));
  assert.deepEqual(s.board.spec.items[0], {
    id: 'constraint-1',
    section: '2',
    type: 'constraint',
    text: 'Data stays in the EU',
    category: 'regulatory',
    source: { kind: 'document', document: 'doc-1', quote: 'all data must stay in the EU' },
  });
  assert.match(s.summary().document[0], /^constraint-1 \[2\]: Data stays in the EU$/);
  assert.ok(!('error' in s.apply(toChangeBody('remove_item', { id: 'constraint-1' })!, 'coach', 'test')));
  assert.equal(s.board.spec.items.length, 0);
});
