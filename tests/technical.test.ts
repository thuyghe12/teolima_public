import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyChange, replay, type Change, type ChangeBody } from '../shared/board/changes';
import { emptyBoard, type Board } from '../shared/board/schema';
import { gate, technicalGaps } from '../shared/board/stages';
import { resourcePlan, setting } from '../shared/board/deployment';
import { CHECKLIST } from '../shared/board/waf';
import { approveSolution, supportChanges, technicalRecords } from './fixtures/support-board';
import { referenceDiscovery, referenceSolution } from './fixtures/reference-workflow-automation';

const at = '2026-11-19T16:00:00.000Z';
const said = { source: 'user' as const, quote: 'agreed' };
const ch = (body: ChangeBody, actor: Change['actor'] = 'coach', basis: Change['basis'] | null = said): Change => ({ body, actor, reason: 'test', at, ...(basis ? { basis } : {}) });
const inTechnical = (): Board => replay(emptyBoard(), [...supportChanges, approveSolution]);
const designed = (): Board => replay(inTechnical(), technicalRecords);
const refused = (b: Board, c: Change, pattern: RegExp) => {
  const r = applyChange(b, c);
  assert.ok('error' in r, 'expected a refusal');
  assert.match(r.error, pattern);
};

test('the checklists ship as generated, identical to the guidance snapshot', () => {
  const { checklist } = JSON.parse(readFileSync('data/knowledge/well-architected.json', 'utf8')) as { checklist: { code: string; pillar: string; url: string; text: string }[] };
  assert.deepEqual(
    CHECKLIST.map((r) => [r.code, r.pillar, r.url]),
    checklist.map((r) => [r.code, r.pillar, r.url]),
    'run npm run knowledge:checklists',
  );
  for (const r of CHECKLIST) assert.ok(checklist.find((c) => c.code === r.code)!.text.startsWith(r.title));
  assert.equal(CHECKLIST.length, 59);
});

test('technical design opens once solution design is approved, and names what it needs', () => {
  const b = inTechnical();
  assert.equal(b.stage.current, 'technical');
  const gaps = gate(b, 'technical').missing.join('\n');
  for (const want of ['region setting', 'network isolation setting', 'platform landing zone setting', 'identity and access concept', 'content safety concept', 'evaluation concept', 'assumption on rollout', 'Well-Architected review of all recommendations']) {
    assert.ok(gaps.includes(want), want);
  }
});

test('technical design is ready when settings, concepts, assumptions and the review are complete', () => {
  const b = designed();
  assert.deepEqual(technicalGaps(b), []);
  const r = applyChange(b, ch({ op: 'approve_stage', stage: 'technical', by: 'Security lead' }, 'user', null));
  assert.ok(r.ok && r.board.stage.current === 'compile');
});

test('a setting names its category, and a setting with fixed options names one of them', () => {
  const b = inTechnical();
  refused(b, ch({ op: 'record_item', section: '7', type: 'setting', name: 'x', text: 'y' }), /names its category: region, network_isolation/);
  refused(b, ch({ op: 'record_item', section: '7', type: 'setting', category: 'network_isolation', name: 'Half open', text: 'y' }), /Private networking, Public endpoints/);
  assert.equal(setting(designed(), 'region'), 'Sweden Central');
});

test('a quality scenario serves a quality goal and states its measure', () => {
  // the support design with one more quality goal in discovery
  const approval = supportChanges.findIndex((c) => c.body.op === 'approve_stage');
  const goal = ch({ op: 'record_item', section: '1.2', type: 'quality', attribute: 'performance', text: 'Answers arrive fast' });
  const b = replay(emptyBoard(), [...supportChanges.slice(0, approval), goal, ...supportChanges.slice(approval), approveSolution]);
  assert.equal(b.stage.current, 'technical');
  assert.ok(technicalGaps(b).includes('a quality scenario for quality-1'));
  refused(b, ch({ op: 'record_item', section: '10', type: 'quality_scenario', text: 'Under load, answers stay fast', serves: ['quality-1'] }), /measure/);
  refused(b, ch({ op: 'record_item', section: '10', type: 'quality_scenario', text: 'Under load, answers stay fast', measure: 'p95 under 4 s' }), /quality goal from 1.2/);
  const r = applyChange(b, ch({ op: 'record_item', section: '10', type: 'quality_scenario', text: 'At 50 concurrent customers, answers stay fast', measure: 'p95 under 4 s', serves: ['quality-1'] }));
  assert.ok(r.ok);
  assert.ok(!technicalGaps(r.board).includes('a quality scenario for quality-1'));
});

test('the review takes only real recommendations, and anything not met says why', () => {
  const b = inTechnical();
  refused(b, ch({ op: 'review', checks: [{ code: 'RE:99', status: 'met' }] }), /not a recommendation/);
  refused(b, ch({ op: 'review', checks: [{ code: 'SE:06', status: 'partly' }] }), /say why/);
  refused(b, ch({ op: 'review', checks: [{ code: 'SE:06', status: 'met' }] }, 'coach', null), /source/);
  const r = applyChange(b, ch({ op: 'review', checks: [{ code: 'SE:06', status: 'partly', note: 'Egress rules still to agree' }, { code: 'RE:01', status: 'met' }] }));
  assert.ok(r.ok);
  assert.deepEqual(r.board.spec.reviews.map((x) => x.code), ['RE:01', 'SE:06'], 'kept in checklist order');
});

test('the review belongs to technical design: refused before it, frozen after approval', () => {
  const solution = replay(emptyBoard(), supportChanges);
  refused(solution, ch({ op: 'review', checks: [{ code: 'RE:01', status: 'met' }] }), /technical design/i);
});

test('resource plan: prompt agents with private networking follow the baseline Foundry architecture', () => {
  const p = resourcePlan(designed());
  assert.equal(p.hosting, 'Prompt agents');
  assert.ok(p.isolated);
  const services = p.resources.map((r) => r.service);
  for (const s of ['Azure Application Gateway', 'Azure App Service', 'Foundry Agent Service', 'Microsoft Foundry', 'Azure Cosmos DB for NoSQL', 'Azure Storage', 'Azure AI Search', 'Application Insights', 'Log Analytics workspace', 'Azure Virtual Network', 'Azure Firewall', 'Azure DNS']) {
    assert.ok(services.includes(s), s);
  }
  assert.ok(!services.includes('Azure Container Apps'));
  for (const r of p.resources) assert.match(r.source, /^https:\/\/learn\.microsoft\.com\//, r.id);
  assert.deepEqual(p.open, []);
  assert.ok(p.ask.some((a) => a.startsWith('the model for')), 'agents without a model are asked in the wizard');
});

test('resource plan: self-hosted orchestration runs in Container Apps, with a registry, as the reference does', () => {
  const p = resourcePlan(replay(emptyBoard(), [...referenceDiscovery, ...referenceSolution]));
  assert.equal(p.hosting, 'Self-hosted orchestration');
  const services = p.resources.map((r) => r.service);
  assert.ok(services.includes('Azure Container Apps') && services.includes('Azure Container Registry'));
  assert.ok(!services.includes('Foundry Agent Service'));
  assert.equal(p.resources.filter((r) => r.id.startsWith('model-')).map((r) => r.purpose).join(), 'gpt-4.1');
  assert.ok(p.resources.some((r) => r.id === 'memory' && r.service === 'Azure Cosmos DB for NoSQL'));
});

test('resource plan: public endpoints drop the network, and a platform landing zone provides it', () => {
  const pub = replay(inTechnical(), [ch({ op: 'record_item', section: '7', type: 'setting', category: 'network_isolation', name: 'Public endpoints', text: 'A pilot' })]);
  const p = resourcePlan(pub);
  assert.ok(!p.isolated);
  assert.ok(!p.resources.some((r) => r.service === 'Azure Virtual Network' || r.service === 'Azure Application Gateway'));
  assert.ok(p.resources.every((r) => !r.private));
  const reused = replay(designed(), [ch({ op: 'record_item', id: 'setting-3', section: '7', type: 'setting', category: 'landing_zone', name: 'Existing platform landing zone', text: 'The hub exists' })]);
  const net = resourcePlan(reused).resources.filter((r) => ['vnet', 'private-dns', 'firewall'].includes(r.id));
  assert.equal(net.length, 3);
  assert.ok(net.every((r) => r.reused));
});

test('technical design draws the resource plan as a C4 deployment view, below solution design', async () => {
  const { layoutWorkspace } = await import('../shared/board/workspace');
  const { assertClean, inside } = await import('./helpers/layout');
  const b = designed();
  const w = layoutWorkspace(b);
  assertClean(w);
  assert.deepEqual(w.frames.map((f) => f.id), ['discovery', 'solution', 'technical']);
  const [, sol, tech] = w.frames;
  assert.ok(sol.y + sol.h < tech.y);
  assert.match(tech.label, /^3 · TECHNICAL DESIGN · DEPLOYMENT/);
  const plan = resourcePlan(b);
  const cards = w.nodes.filter((n) => n.id.startsWith('dep-') && n.kind === 'resource');
  assert.deepEqual(cards.map((n) => n.id).sort(), plan.resources.map((r) => `dep-${r.id}`).sort(), 'one card per resource');
  for (const n of w.nodes.filter((n) => n.id.startsWith('dep-'))) assert.ok(inside(n, tech), `${n.id} inside the frame`);
  const vnet = w.panels.find((p) => p.id === 'dep-vnet')!;
  for (const r of plan.resources.filter((r) => r.private)) assert.ok(inside(w.nodes.find((n) => n.id === `dep-${r.id}`)!, vnet), `${r.id} inside the virtual network`);
  // the request path runs left to right
  const x = (id: string) => w.nodes.find((n) => n.id === `dep-${id}`)!.x;
  assert.ok(x('app-gateway') < x('app-service') && x('app-service') < x('agent-service') && x('agent-service') < x('foundry'));
});

test('the deployment view of the reference shows Container Apps and its registry, and no virtual network when public', async () => {
  const { layoutWorkspace } = await import('../shared/board/workspace');
  const { assertClean } = await import('./helpers/layout');
  const ref = replay(emptyBoard(), [...referenceDiscovery, ...referenceSolution, approveSolutionAs('Architect'), ch({ op: 'record_item', section: '7', type: 'setting', category: 'network_isolation', name: 'Public endpoints', text: 'A pilot' })]);
  assert.equal(ref.stage.current, 'technical');
  const w = layoutWorkspace(ref);
  assertClean(w);
  assert.ok(w.nodes.some((n) => n.id === 'dep-container-apps') && w.nodes.some((n) => n.id === 'dep-container-registry'));
  assert.ok(!w.panels.some((p) => p.id === 'dep-vnet'));
});

function approveSolutionAs(by: string): Change {
  return { body: { op: 'approve_stage', stage: 'solution', by }, actor: 'user', reason: 'Approved in the app', at };
}
