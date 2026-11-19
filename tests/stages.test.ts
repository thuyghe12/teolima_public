import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyChange, replay, type Change, type ChangeBody } from '../shared/board/changes';
import { emptyBoard, type Board } from '../shared/board/schema';
import { gate, outOfStage, STAGES } from '../shared/board/stages';
import { approved, supportChanges } from './fixtures/support-board';

const at = '2026-11-19T13:00:00.000Z';
const ch = (body: ChangeBody, actor: Change['actor'] = 'coach'): Change => ({ body, actor, reason: 'test', at });
const briefed = (): Board => {
  const r = applyChange(emptyBoard(), ch({ op: 'set_brief', goal: 'Answer order questions' }, 'user'));
  assert.ok(r.ok);
  return r.board;
};

test('four stages, in order, each with its audience, approver and changes', () => {
  assert.deepEqual(STAGES.map((s) => [s.n, s.id]), [[1, 'discovery'], [2, 'solution'], [3, 'technical'], [4, 'compile']]);
  for (const s of STAGES) assert.ok(s.audience && s.approver && s.artifact, s.id);
  // every change belongs to at most one stage, except the title
  const owners = new Map<string, string[]>();
  for (const s of STAGES) for (const op of s.ops) owners.set(op, [...(owners.get(op) ?? []), s.id]);
  for (const [op, stages] of owners) if (op !== 'set_title') assert.equal(stages.length, 1, op);
});

test('discovery is approved by a person once its gate is met, and opens solution design', () => {
  const b = briefed();
  assert.deepEqual(gate(b, 'discovery'), {
    ready: false,
    missing: ['goals', 'success metrics', 'user flows', 'human oversight', 'security, privacy and compliance', 'stakeholders', 'scope', 'people around it', 'systems around it'],
  });
  const early = applyChange(b, ch({ op: 'approve_stage', stage: 'discovery', by: 'Anna, sponsor' }, 'user'));
  assert.ok('error' in early && /not ready for approval/.test(early.error));
  const done = approved(b);
  assert.equal(done.stage.current, 'solution');
  assert.deepEqual(done.stage.approvals, [{ stage: 'discovery', by: 'Business sponsor', at: '2026-11-18T12:00:00.000Z' }]);
});

test('the coach and workers can neither approve nor reopen a stage', () => {
  const b = approved(briefed());
  for (const actor of ['coach', 'worker:network'] as const) {
    const r = applyChange(b, ch({ op: 'reopen_stage', stage: 'discovery' }, actor));
    assert.ok('error' in r && /Only a person/.test(r.error), actor);
  }
});

test('each stage accepts only its own changes; an approved stage is frozen until reopened', () => {
  const b = approved(briefed());
  assert.equal(outOfStage(b, 'record_item'), null, 'document edits are checked per section in the change log');
  assert.equal(outOfStage(b, 'upsert_component'), null);
  assert.match(outOfStage(briefed(), 'upsert_team')!, /belongs to solution design, and the current stage is discovery/);
  const reopened = applyChange(b, ch({ op: 'reopen_stage', stage: 'discovery' }, 'user'));
  assert.ok(reopened.ok);
  assert.equal(reopened.board.stage.current, 'discovery');
  assert.deepEqual(reopened.board.stage.approvals, []);
  const added = applyChange(reopened.board, { ...ch({ op: 'record_item', section: '1.3', type: 'stakeholder', name: 'Auditors', text: 'Review the logs' }), basis: { source: 'user', quote: 'auditors too' } });
  assert.ok(added.ok, 'a reopened discovery accepts requirements again');
  const ahead = applyChange(briefed(), ch({ op: 'reopen_stage', stage: 'solution' }, 'user'));
  assert.ok('error' in ahead && /has not started/.test(ahead.error));
});

test('solution design is ready for approval when its steps are done; later stages are not built yet', () => {
  const b = replay(emptyBoard(), supportChanges);
  assert.equal(b.stage.current, 'solution');
  assert.deepEqual(gate(b, 'solution'), { ready: true, missing: [] });
  const r = applyChange(b, ch({ op: 'approve_stage', stage: 'solution', by: 'Lead architect' }, 'user'));
  assert.ok(r.ok && r.board.stage.current === 'technical');
  assert.deepEqual(gate(r.board, 'technical'), { ready: false, missing: ['this stage is not built yet'] });
  const wrong = applyChange(b, ch({ op: 'approve_stage', stage: 'technical', by: 'x' }, 'user'));
  assert.ok('error' in wrong && /only it can be approved/.test(wrong.error));
});

test('the workspace draws discovery as a context diagram, and solution design in a frame below it', async () => {
  const { layoutWorkspace, currentFrame } = await import('../shared/board/workspace');
  const { assertClean, overlaps } = await import('./helpers/layout');
  const disc = layoutWorkspace(approved(briefed()));
  // discovery: one actor, the system, one external system, joined left to right
  const ctx = disc.nodes.filter((n) => n.id.startsWith('ctx-'));
  assert.deepEqual(ctx.map((n) => n.kind), ['actor', 'system', 'external']);
  assert.ok(ctx[0].x < ctx[1].x && ctx[1].x < ctx[2].x);
  assert.equal(disc.edges.filter((e) => e.id.startsWith('ctx:')).length, 2);
  assert.deepEqual(disc.frames.map((f) => f.id), ['discovery', 'solution']);
  assert.match(disc.frames[0].label, /^1 · DISCOVERY · SYSTEM CONTEXT · APPROVED BY BUSINESS SPONSOR$/);

  const full = layoutWorkspace(replay(emptyBoard(), supportChanges));
  const [d, s] = full.frames;
  assert.ok(d.y + d.h < s.y, 'solution design sits below discovery');
  for (const n of full.nodes) {
    const frame = n.id.startsWith('ctx-') ? d : s;
    assert.ok(n.x >= frame.x && n.y >= frame.y && n.x + n.w <= frame.x + frame.w && n.y + n.h <= frame.y + frame.h, `${n.id} sits inside its frame`);
  }
  assert.ok(!overlaps(d, s));
  assertClean(full);
  assert.equal(currentFrame(full, replay(emptyBoard(), supportChanges))?.id, 'solution');

  // before any discovery, nothing is drawn; during discovery, only its frame
  assert.equal(layoutWorkspace(emptyBoard()).frames.length, 0);
  assert.deepEqual(layoutWorkspace(briefed()).frames.map((f) => f.id), ['discovery']);
});

test('the context diagram names each neighbour, and labels each relationship with what is exchanged', async () => {
  const { layoutWorkspace } = await import('../shared/board/workspace');
  const r = applyChange(briefed(), { ...ch({ op: 'record_item', section: '3.2', type: 'system', text: 'Orders and their status', name: 'Order system' }), basis: { source: 'user', quote: 'orders from the ERP' } });
  assert.ok(r.ok);
  const ws = layoutWorkspace(r.board);
  const node = ws.nodes.find((n) => n.kind === 'external')!;
  assert.equal(node.title, 'Order system');
  assert.equal(ws.edges.find((e) => e.id === 'ctx:system>ctx-system-1')?.label, 'Orders and their status', 'C4: the relationship says what is exchanged');
});
