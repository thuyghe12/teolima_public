import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBoard } from '../shared/board/schema';
import { replay } from '../shared/board/changes';
import { layoutBoard } from '../shared/board/layout';
import { boardElements, boardLayer } from '../src/lib/canvas/boardElements';
import { supportChanges } from './fixtures/support-board';

test('every board element gets a stable, unique id', () => {
  const els = boardElements(layoutBoard(replay(emptyBoard(), supportChanges)));
  const ids = els.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('board:node:triage'));
  assert.ok(ids.includes('board:team:support-desk'));
  assert.ok(ids.includes('board:edge:customer-message--triage'));
  assert.ok(ids.includes('board:title'));
  assert.deepEqual(boardElements(layoutBoard(replay(emptyBoard(), supportChanges))), els);
});

test('cards carry their role, connectors their style', () => {
  const els = boardElements(layoutBoard(replay(emptyBoard(), supportChanges)));
  const approval = els.find((e) => e.id === 'board:node:refund-approval')!;
  assert.equal(approval.agentRole, 'approval');
  const uses = els.find((e) => e.id.includes('~refund-api'))!;
  assert.equal(uses.lineStyle, 'dotted');
  assert.equal(uses.arrowHead, false);
});

test('draw order puts teams at the back and the user drawings on top', () => {
  assert.ok(boardLayer('board:team:x') < boardLayer('board:edge:x'));
  assert.ok(boardLayer('board:edge:x') < boardLayer('board:node:x'));
  assert.ok(boardLayer('board:node:x') < boardLayer('user-stroke-1'));
});
