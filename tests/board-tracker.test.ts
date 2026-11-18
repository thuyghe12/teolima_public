import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoardTracker } from '../server/board-tracker';

test('a component drawn once is reported as a duplicate the second time, ignoring case and spacing', () => {
  const t = new BoardTracker();
  assert.equal(t.duplicateReason('draw_agent_node', { label: 'Game Data Intake' }), null);
  t.record('draw_agent_node', { label: 'Game Data Intake' });
  assert.match(t.duplicateReason('draw_agent_node', { label: '  game   data intake ' }) ?? '', /already on the board/);
});

test('a connection drawn once is a duplicate, the reverse direction is not', () => {
  const t = new BoardTracker();
  t.record('draw_connection', { fromNode: 'Router', toNode: 'Refund Agent' });
  assert.ok(t.duplicateReason('draw_connection', { fromNode: 'router', toNode: 'refund agent' }));
  assert.equal(t.duplicateReason('draw_connection', { fromNode: 'Refund Agent', toNode: 'Router' }), null);
});

test('the board reported by the browser replaces the record, so erased components can be drawn again', () => {
  const t = new BoardTracker();
  t.record('draw_agent_node', { label: 'Router' });
  t.syncFromCanvas([{ type: 'shape', label: 'Policy Search', role: 'tool' }, { type: 'text', label: 'Title' }]);
  assert.equal(t.duplicateReason('draw_agent_node', { label: 'Router' }), null);
  assert.ok(t.duplicateReason('draw_agent_node', { label: 'Policy Search' }));
  assert.deepEqual(t.labels(), ['Policy Search']);
});

test('clearing the canvas forgets everything', () => {
  const t = new BoardTracker();
  t.record('draw_agent_node', { label: 'Router' });
  t.record('clear_canvas');
  assert.deepEqual(t.labels(), []);
});
