import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyChange, replay, type Change, type ChangeBody } from '../shared/board/changes';
import { emptyBoard, type Board } from '../shared/board/schema';
import { gate, traceability } from '../shared/board/stages';
import { scenarioSteps, servedBy, stageMarkdown, traceTargets } from '../shared/board/spec-document';
import { supportChanges } from './fixtures/support-board';

const at = '2026-11-19T14:00:00.000Z';
const said = { source: 'user' as const, quote: 'sounds right' };
const ch = (body: ChangeBody, actor: Change['actor'] = 'coach', basis?: Change['basis']): Change => ({ body, actor, reason: 'test', at, ...(basis ? { basis } : {}) });
const designed = (): Board => replay(emptyBoard(), supportChanges);
const apply = (b: Board, c: Change): Board => {
  const r = applyChange(b, c);
  assert.ok(r.ok, 'error' in r ? r.error : '');
  return r.board;
};
const refused = (b: Board, c: Change, pattern: RegExp) => {
  const r = applyChange(b, c);
  assert.ok('error' in r, 'expected a refusal');
  assert.match(r.error, pattern);
};

test('every flow, requirement, oversight rule and external system traces to the design', () => {
  const b = designed();
  assert.deepEqual(traceability(b), []);
  const targets = traceTargets(b);
  assert.deepEqual(targets.map((t) => t.id), ['flow-1', 'oversight-1', 'system-1', 'system-2']);
  for (const t of targets) assert.ok(servedBy(b, t.id).length, `${t.id} is served`);
});

test('the gate names each gap: an unserved system, an unenforced rule, an agent with no purpose, a missing scenario', () => {
  let b = designed();
  const tool = b.components.find((c) => c.kind === 'tool' && c.serves.includes('system-2'))!;
  b = apply(b, ch({ op: 'remove_component', ref: tool.name }));
  const approval = b.components.find((c) => c.kind === 'approval');
  if (approval) b = apply(b, ch({ op: 'remove_component', ref: approval.name }));
  b = apply(b, ch({ op: 'upsert_component', kind: 'agent', name: 'Spare', description: 'Does nothing yet' }));
  b = apply(b, ch({ op: 'remove_scenario', ref: b.spec.scenarios[0].id }));
  const missing = gate(b, 'solution').missing.join('\n');
  assert.match(missing, /reaches Payment service/);
  assert.match(missing, /enforces oversight-1/);
  assert.match(missing, /what agent "Spare" serves/);
  assert.match(missing, /runtime scenario for flow-1/);
});

test('an oversight rule can instead be met by a decision that serves it', () => {
  let b = designed();
  const approval = b.components.find((c) => c.kind === 'approval')!;
  b = apply(b, ch({ op: 'remove_component', ref: approval.name }));
  assert.ok(traceability(b).some((g) => g.includes('oversight-1')));
  b = apply(
    b,
    ch({ op: 'record_item', section: '9', type: 'decision', topic: 'other', name: 'Payment service limit', text: 'The payment service holds refunds over 100 EUR for a person', options: ['Approval in the agent', 'Payment service limit'], serves: ['oversight-1'] }, 'coach', said),
  );
  assert.ok(!traceability(b).some((g) => g.includes('oversight-1')));
});

test('a block cannot serve an item that does not exist', () => {
  refused(designed(), ch({ op: 'upsert_component', kind: 'agent', name: 'Ghost', serves: ['flow-99'] }), /flow-99/);
});

test('a decision names its topic, and its name is the option chosen', () => {
  const b = designed();
  refused(b, ch({ op: 'record_item', section: '9', type: 'decision', name: 'Prompt agents', text: 'x' }, 'coach', said), /topic/);
  refused(b, ch({ op: 'record_item', section: '9', type: 'decision', topic: 'hosting', name: 'Containers', text: 'x', options: ['Prompt agents', 'Hosted agents'] }, 'coach', said), /option chosen/);
});

test('a quality approach names the quality goal it meets', () => {
  refused(designed(), ch({ op: 'record_item', section: '4', type: 'quality_approach', text: 'Sign-in first' }, 'coach', said), /quality goal from 1.2/);
});

test('a scenario realises a user flow, through people, systems and blocks that exist, and quotes its source', () => {
  const b = designed();
  const steps = [{ from: 'Customer message', to: 'Triage', what: 'passes the message' }];
  refused(b, ch({ op: 'set_scenario', flow: 'goal-1', title: 'x', steps }, 'coach', said), /not a user flow/);
  refused(b, ch({ op: 'set_scenario', flow: 'flow-1', title: 'x', steps: [{ from: 'Nobody', to: 'Triage', what: 'x' }] }, 'coach', said), /Step 1: "Nobody"/);
  refused(b, ch({ op: 'set_scenario', flow: 'flow-1', title: 'x', steps }), /source/);
});

test('a scenario reads by name, and the gate flags a step whose block was removed', () => {
  let b = designed();
  const sc = b.spec.scenarios[0];
  const block = b.components.find((c) => c.id === sc.steps[0].to)!;
  assert.ok(scenarioSteps(b, sc)[0].includes(` → ${block.name}: `));
  b = apply(b, ch({ op: 'remove_component', ref: block.name }));
  assert.ok(traceability(b).some((g) => g.startsWith(`${sc.id}: steps that refer to`)));
});

test('the solution design document: strategy, building blocks with traceability, runtime scenarios, decision records', () => {
  const md = stageMarkdown(designed(), 'solution');
  for (const h of ['## 4. Solution strategy', '## 5. Building block view', '**Traceability**', '## 6. Runtime view', '## 9. Architecture decisions']) assert.ok(md.includes(h), h);
  assert.match(md, /\| system-2 \(Payment service\) \| [^|]*\w/);
  assert.match(md, /^1\. .+ → .+: /m);
  assert.match(md, /Prompt agents \(chosen\)/);
  assert.ok(!md.includes('not covered'));
  assert.ok(!md.includes('Open before approval'));
});

test('the container view keeps the context: people on the left of the entry point, each external system below what reaches it', async () => {
  const { layoutWorkspace } = await import('../shared/board/workspace');
  const { assertClean } = await import('./helpers/layout');
  const b = designed();
  const w = layoutWorkspace(b);
  assertClean(w);
  const node = (id: string) => w.nodes.find((n) => n.id === id)!;
  const customer = node('c2-person-1');
  const entry = w.nodes.find((n) => n.kind === 'trigger')!;
  assert.equal(customer.kind, 'actor');
  assert.ok(customer.x + customer.w < entry.x, 'the person sits left of the entry point');
  assert.ok(w.edges.some((e) => e.id === `c2:person-1>${entry.id}`));
  for (const sys of b.spec.items.filter((i) => i.section === '3.2' && i.type === 'system')) {
    const box = node(`c2-${sys.id}`);
    const reacher = b.components.find((c) => c.serves.includes(sys.id))!;
    const r = node(reacher.id);
    assert.ok(box.y > r.y + r.h, `${sys.name} sits below ${reacher.name}`);
    assert.ok(w.edges.some((e) => e.id === `c2:${reacher.id}>${sys.id}`), `${reacher.name} reaches ${sys.name}`);
  }
  const frame = w.frames.find((f) => f.id === 'solution')!;
  assert.match(frame.label, /^2 · SOLUTION DESIGN · CONTAINERS/);
});

test('a scenario step goes from one participant to another', () => {
  refused(designed(), ch({ op: 'set_scenario', flow: 'flow-1', title: 'x', steps: [{ from: 'Triage', to: 'Triage', what: 'thinks' }] }, 'coach', said), /to itself/);
});

test('each runtime scenario draws as a dynamic view: participants in order of appearance, lifelines, numbered steps top to bottom', async () => {
  const { layoutWorkspace } = await import('../shared/board/workspace');
  const { assertClean, inside } = await import('./helpers/layout');
  const b = designed();
  const sc = b.spec.scenarios[0];
  const w = layoutWorkspace(b);
  assertClean(w);
  const panel = w.panels.find((p) => p.id === `dyn-${sc.id}`)!;
  assert.match(panel.label, /^DYNAMIC VIEW · 6\.1 /);
  const frame = w.frames.find((f) => f.id === 'solution')!;
  assert.ok(inside(panel, frame), 'the dynamic view sits inside the solution design frame');
  const boundary = w.boundary!;
  assert.ok(panel.y > boundary.y + boundary.h, 'below the container view');

  const cards = w.nodes.filter((n) => n.id.startsWith(`dyn-${sc.id}-`));
  const firstSeen = [...new Set(sc.steps.flatMap((s) => [s.from, s.to]))];
  assert.deepEqual(cards.map((c) => c.id.slice(`dyn-${sc.id}-`.length)), firstSeen);
  for (let i = 1; i < cards.length; i++) assert.ok(cards[i].x > cards[i - 1].x + cards[i - 1].w, 'in a row, left to right');
  for (const c of cards) assert.ok(inside(c, panel));

  const lifelines = w.edges.filter((e) => e.kind === 'lifeline' && e.id.startsWith(`dyn:${sc.id}|`));
  assert.equal(lifelines.length, cards.length);
  const steps = w.edges.filter((e) => e.id.startsWith(`dyn:${sc.id}#`));
  assert.equal(steps.length, sc.steps.length);
  steps.forEach((e, n) => {
    assert.ok(e.label.startsWith(`${n + 1}. `));
    assert.equal(e.points[0].y, e.points[1].y, 'a step is horizontal');
    if (n) assert.ok(e.points[0].y > steps[n - 1].points[0].y, 'steps go down in order');
  });
});

test('the dynamic view follows the scenario: removing it removes the view', async () => {
  const { layoutWorkspace } = await import('../shared/board/workspace');
  const b = apply(designed(), ch({ op: 'remove_scenario', ref: designed().spec.scenarios[0].id }));
  assert.equal(layoutWorkspace(b).panels.length, 0);
});
