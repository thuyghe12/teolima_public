import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_TOOLS, BoardSession, boardToolDeclarations, toChangeBody } from '../server/board-tools';

const briefed = () => {
  const s = new BoardSession();
  s.apply(toChangeBody('set_brief', { goal: 'Test system' })!, 'user', 'test');
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
  assert.equal(s.changes.length, 8);
  assert.ok(s.changes.slice(2).every((c) => c.actor === 'coach'));
});

test('a refused change leaves the session untouched and explains why', () => {
  const s = briefed();
  const r = s.apply(toChangeBody('set_team', { name: 'T', pattern: 'sequential', members: ['Ghost'] })!, 'coach', 'test');
  assert.ok('error' in r && /not on the board/.test(r.error));
  assert.equal(s.changes.length, 2);
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

test('the coach saves a brief before building, and the server refuses to build without one', () => {
  const s = new BoardSession();
  const early = s.apply(toChangeBody('add_component', { kind: 'agent', name: 'Eager' })!, 'coach', 'test');
  assert.ok('error' in early && /No goal yet/.test(early.error));
  const brief = s.apply(toChangeBody('set_brief', { goal: 'Route support tickets', audience: 'Support staff', constraints: ['EU data only'] })!, 'coach', 'Confirmed with the user');
  assert.ok(!('error' in brief));
  assert.deepEqual(s.summary().brief, { goal: 'Route support tickets', audience: 'Support staff', constraints: ['EU data only'] });
  assert.ok(!('error' in s.apply(toChangeBody('add_component', { kind: 'agent', name: 'Triage' })!, 'coach', 'test')));
});
