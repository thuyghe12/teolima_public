import { replay, type Basis, type Change, type ChangeBody } from '../../shared/board/changes';
import { emptyBoard, type Board } from '../../shared/board/schema';
import { CHECKLIST } from '../../shared/board/waf';

const at = '2026-11-18T12:00:00.000Z';
const c = (body: ChangeBody, reason: string, basis?: Basis): Change => ({ body, actor: 'coach', reason, at, ...(basis ? { basis } : {}) });

type ItemFields = Omit<Extract<ChangeBody, { op: 'record_item' }>, 'op' | 'id'>;
const item = (fields: ItemFields, quote: string): Change => c({ op: 'record_item', ...fields }, 'Stated by the user', { source: 'user', quote });

/** A discovery that covers every required topic: what every test design needs before it can be built. */
export const discoveryChanges: Change[] = [
  item({ section: '1.1', type: 'goal', text: 'Customers get answers in minutes instead of days' }, 'wait days for answers'),
  item({ section: '1.1', type: 'metric', text: 'Most order questions are answered without a person' }, 'answered without a person'),
  item({ section: '1.1', type: 'flow', text: 'A customer asks where an order is and gets its status' }, 'where is my order'),
  item({ section: '1.1', type: 'oversight', text: 'Refunds over 100 EUR need a person' }, 'refunds over 100 EUR need a person'),
  item({ section: '2', type: 'constraint', category: 'regulatory', text: 'Customer data stays in the EU' }, 'data stays in the EU'),
  item({ section: '1.3', type: 'stakeholder', name: 'Head of support', text: 'Owns the results' }, 'head of support owns it'),
  item({ section: '3.1', type: 'in_scope', text: 'Order status and refunds' }, 'order status and refunds'),
  item({ section: '3.2', type: 'person', name: 'Customer', text: 'Asks about orders' }, 'customers of a web shop'),
  item({ section: '3.2', type: 'system', name: 'Order system', text: 'Order status' }, 'order system and refund API'),
  item({ section: '3.2', type: 'system', name: 'Payment service', text: 'Issues refunds' }, 'order system and refund API'),
];

const decision = (topic: 'platform' | 'complexity' | 'pattern' | 'hosting', name: string, text: string, options: string[], consequences: string): Change =>
  c({ op: 'record_item', section: '9', type: 'decision', topic, name, text, options, consequences }, 'Agreed with the user', { source: 'user', quote: 'sounds right' });

/** The decisions and the runtime scenario that make the support design traceable. */
export const solutionRecords: Change[] = [
  decision('platform', 'Microsoft Foundry', 'Build custom agents in Microsoft Foundry', ['SaaS agents', 'Copilot Studio', 'Microsoft Foundry'], 'Pro-code control over the refund boundary; the team maintains the agents.'),
  decision('complexity', 'Several agents', 'A triage agent with three specialists', ['One agent with tools', 'Several agents'], 'Only the refund agent may move money: a security boundary.'),
  decision('pattern', 'Handoff', 'Handoff from triage to the right specialist', ['Sequential', 'Handoff', 'Group chat'], 'The right specialist is only known after reading the request.'),
  decision('hosting', 'Hosted agents', 'The handoff team runs as Agent Framework code on Foundry Agent Service', ['Prompt agents', 'Hosted agents', 'Self-hosted orchestration'], 'Deterministic handoff and approval in code; Foundry runs the container.'),
  c(
    { op: 'set_scenario', flow: 'flow-1', title: 'Where is my order', steps: [
      { from: 'person-1', to: 'Customer message', what: 'asks where the order is' },
      { from: 'Customer message', to: 'Triage', what: 'passes the message' },
      { from: 'Triage', to: 'Order Status', what: 'hands off an order question' },
      { from: 'Order Status', to: 'Order lookup', what: 'looks up the order' },
      { from: 'Order lookup', to: 'system-1', what: 'reads the order status' },
      { from: 'Order Status', to: 'Reply to customer', what: 'answers with the status' },
    ] },
    'Realises the user flow',
    { source: 'user', quote: 'where is my order' },
  ),
];

/** The user approving discovery in the app, which opens solution design. */
export const approveDiscovery: Change = { body: { op: 'approve_stage', stage: 'discovery', by: 'Business sponsor' }, actor: 'user', reason: 'Approved in the app', at };

/** Records the discovery on a board. */
export const discovered = (board: Board): Board => replay(board, discoveryChanges);

/** Records the discovery and approves it, so solution design can start. Needs a goal. */
export const approved = (board: Board): Board => replay(board, [...discoveryChanges, approveDiscovery]);

export const DISCOVERED_SPEC = discovered(emptyBoard()).spec;

/** A customer support system built only through changes, as the coach would. */
/** A board with a goal and nothing else: where every test design starts. */
export const briefedBoard = (): Board => ({
  ...emptyBoard(),
  brief: { goal: 'Test system', audience: '', constraints: [] },
  spec: DISCOVERED_SPEC,
  stage: { current: 'solution', approvals: [{ stage: 'discovery', by: 'Business sponsor', at }] },
  shape: { kind: 'multi', reasons: ['security_or_compliance_boundary'] },
});

export const supportChanges: Change[] = [
  c({ op: 'set_brief', goal: 'Answer order questions and handle refunds safely', audience: 'Customers of a web shop', constraints: ['Refunds over 100 EUR need a person'] }, 'Brief from the user'),
  ...discoveryChanges,
  approveDiscovery,
  c({ op: 'set_title', title: 'Customer support' }, 'Name the system'),
  c({ op: 'set_shape', shape: 'multi', reasons: ['security_or_compliance_boundary'] }, 'Only the refund agent may move money'),
  c({ op: 'upsert_component', kind: 'trigger', name: 'Customer message', source: 'chat', serves: ['person-1'] }, 'Where work enters'),
  c({ op: 'upsert_component', kind: 'tool', name: 'Order lookup', toolType: 'openapi', serves: ['system-1'] }, 'Order data'),
  c({ op: 'upsert_component', kind: 'tool', name: 'Refund API', toolType: 'openapi', serves: ['system-2'] }, 'Issues refunds'),
  c({ op: 'upsert_component', kind: 'knowledge', name: 'Policy docs', source: 'ai_search', serves: ['goal-1'] }, 'Grounding for policy answers'),
  c({ op: 'upsert_component', kind: 'agent', name: 'Triage', instructions: 'Classify intent and hand off.', serves: ['flow-1'] }, 'Routes requests'),
  c({ op: 'upsert_component', kind: 'agent', name: 'Order Status', tools: ['Order lookup'], serves: ['flow-1'] }, 'Answers order questions'),
  c({ op: 'upsert_component', kind: 'agent', name: 'Refunds', tools: ['Refund API'], serves: ['in-scope-1'] }, 'Prepares refunds'),
  c({ op: 'upsert_component', kind: 'agent', name: 'Policy', knowledge: ['Policy docs'], serves: ['goal-1'] }, 'Answers policy questions'),
  c({ op: 'upsert_team', name: 'Support desk', pattern: 'handoff', members: ['Triage', 'Order Status', 'Refunds', 'Policy'], startAgent: 'Triage' }, 'Triage hands off to specialists'),
  c({ op: 'upsert_component', kind: 'approval', name: 'Refund approval', gates: 'Refund API', condition: 'refunds over 100 EUR', serves: ['oversight-1'] }, 'Money movement is irreversible'),
  c({ op: 'upsert_component', kind: 'guardrail', name: 'Safety', controls: ['prompt_shields', 'harm_filters'] }, 'Protect every agent'),
  c({ op: 'upsert_component', kind: 'output', name: 'Reply to customer', destination: 'chat' }, 'Where answers go'),
  c({ op: 'connect', from: 'Customer message', to: 'Triage', label: 'message' }, 'Entry point'),
  c({ op: 'connect', from: 'Support desk', to: 'Reply to customer', label: 'answer' }, 'Team output'),
  ...solutionRecords,
];

/** The solution design approved, then the technical design that settles everything the compiler needs. */
export const approveSolution: Change = { body: { op: 'approve_stage', stage: 'solution', by: 'Lead architect' }, actor: 'user', reason: 'Approved in the app', at };
const said = (quote: string): Basis => ({ source: 'user', quote });
const tech = (fields: Omit<Extract<ChangeBody, { op: 'record_item' }>, 'op' | 'id'>, quote: string): Change => c({ op: 'record_item', ...fields }, 'Agreed in technical design', said(quote));
export const technicalRecords: Change[] = [
  tech({ section: '7', type: 'setting', category: 'region', name: 'Sweden Central', text: 'Customer data stays in the EU' }, 'data stays in the EU'),
  tech({ section: '7', type: 'setting', category: 'network_isolation', name: 'Private networking', text: 'Customer data never crosses the public internet' }, 'keep it private'),
  tech({ section: '7', type: 'setting', category: 'landing_zone', name: 'Standalone', text: 'No platform landing zone yet' }, 'no landing zone yet'),
  tech({ section: '8', type: 'concept', category: 'identity', text: 'Every service authenticates with a managed identity; no keys' }, 'no keys anywhere'),
  tech({ section: '8', type: 'concept', category: 'networking', text: 'Every service is reached through a private endpoint' }, 'keep it private'),
  tech({ section: '8', type: 'concept', category: 'observability', text: 'Every agent run is traced in Application Insights' }, 'trace every run'),
  tech({ section: '8', type: 'concept', category: 'content_safety', text: 'Prompt Shields and harm filters on every agent' }, 'safe for customers'),
  tech({ section: '8', type: 'concept', category: 'evaluation', text: 'Each runtime scenario is evaluated before release' }, 'test before release'),
  ...(['out_of_scope', 'reliability', 'performance', 'cost', 'operations', 'rollout'] as const).map((t) =>
    tech({ section: '11', type: 'assumption', category: t, text: `Assumed for ${t.replace('_', ' ')} until confirmed` }, 'confirm later'),
  ),
  c({ op: 'review', checks: CHECKLIST.map((r) => ({ code: r.code, status: 'met' as const })) }, 'Reviewed with the platform lead', said('reviewed with the platform lead')),
];
