/**
 * Demo mode: a recorded coaching session, replayed when no GEMINI_API_KEY is set.
 *
 * The replay builds the board through the same board changes the live coach
 * makes, validated by the same change log and laid out by the same layout.
 * A clone of the repo shows the real experience without credentials, and the
 * script doubles as a fixture for the tests.
 */
import type { Basis, ChangeBody } from '../shared/board/changes';

export type DemoStep =
  | { say: string; pauseMs?: number }
  | { change: ChangeBody; reason: string; basis?: Basis; actor?: 'user'; pauseMs?: number };

export const DEMO_GOAL = 'A customer support system that answers order questions and handles refunds safely';

/** What the user tells the coach in the recorded session; every item quotes it. */
export const DEMO_USER_WORDS = [
  DEMO_GOAL,
  'Today customers of our web shop wait two days for an answer, and we cannot keep hiring support staff.',
  'Success means 70 percent of order questions answered without a person, within a minute.',
  'A customer asks where their order is or asks for a refund. If the order is not found, a person takes over.',
  'Refunds over 100 EUR need a person. Returning customers should not have to repeat themselves.',
  'That sounds right: build it in Foundry, keep the agents as simple as you can, and only the refund part may move money.',
  'Handing off to the right specialist is fine, and we would rather not run our own servers.',
  'Customer data must stay in the EU, and only logged-in customers can see their orders.',
  'The head of support owns this, and the support team handles what the system cannot.',
  'It reads our order system and issues refunds through the payment service. Policies are in our FAQ and terms.',
  'The first version covers order status and refunds. Returns and exchanges are not part of it.',
  'Sweden Central works for us. Keep everything private, and there is no landing zone yet.',
  'Use managed identities, no keys. Trace every agent run, and test each scenario before release.',
  'We have no recovery targets and no budget limit yet, and we go live with one shop first.',
  'Answers within a minute are enough, and the support team runs it day to day.',
];

type ItemFields = Omit<Extract<ChangeBody, { op: 'record_item' }>, 'op' | 'id'>;
const item = (fields: ItemFields, quote: string): DemoStep => ({
  change: { op: 'record_item', ...fields },
  reason: 'Stated by the user',
  basis: { source: 'user', quote },
  pauseMs: 450,
});

const setting = (category: 'region' | 'network_isolation' | 'landing_zone', name: string, text: string, quote: string): DemoStep => ({
  change: { op: 'record_item', section: '7', type: 'setting', category, name, text },
  reason: 'Agreed with the user',
  basis: { source: 'user', quote },
  pauseMs: 500,
});

const decide = (topic: 'platform' | 'complexity' | 'pattern' | 'hosting', name: string, text: string, options: string[], consequences: string, quote: string): DemoStep => ({
  change: { op: 'record_item', section: '9', type: 'decision', topic, name, text, options, consequences },
  reason: 'Agreed with the user',
  basis: { source: 'user', quote },
  pauseMs: 500,
});

const add = (change: Omit<Extract<ChangeBody, { op: 'upsert_component' }>, 'op'>, reason: string): DemoStep => ({
  change: { op: 'upsert_component', ...change },
  reason,
});

export const DEMO_SCRIPT: DemoStep[] = [
  { say: "Let's design your customer support system. First what it must do and why, then the design." },
  {
    change: {
      op: 'set_brief',
      goal: DEMO_GOAL,
      audience: 'Customers of a web shop',
      constraints: ['Refunds over 100 EUR need a person', 'Returning customers should not have to repeat themselves'],
    },
    reason: 'The brief the user gave',
  },
  { change: { op: 'set_title', title: 'Customer support' }, reason: 'Name the system' },
  { say: 'Before drawing anything, the functional specification, structured as arc42. I am recording what you told me, each point with your own words as its source.' },
  item({ section: '1.1', type: 'goal', text: 'Customers get an answer within minutes instead of two days, without growing the support team' }, 'wait two days for an answer'),
  item({ section: '1.1', type: 'metric', text: '70% of order questions answered without a person, within a minute' }, '70 percent of order questions answered without a person'),
  item({ section: '1.1', type: 'flow', text: 'A customer asks where an order is or asks for a refund; if the order is not found, a person takes over' }, 'if the order is not found, a person takes over'),
  item({ section: '1.1', type: 'oversight', text: 'Refunds over 100 EUR need a person to approve them' }, 'refunds over 100 EUR need a person'),
  item({ section: '1.1', type: 'requirement', text: 'Returning customers do not have to repeat themselves' }, 'should not have to repeat themselves'),
  item({ section: '1.2', type: 'quality', attribute: 'privacy', text: 'Only logged-in customers can see their own orders' }, 'only logged-in customers can see their orders'),
  item({ section: '2', type: 'constraint', category: 'regulatory', text: 'Customer data stays in the EU' }, 'customer data must stay in the EU'),
  item({ section: '1.3', type: 'stakeholder', name: 'Head of support', text: 'Owns the system and its results' }, 'the head of support owns this'),
  item({ section: '1.3', type: 'stakeholder', name: 'Support team', text: 'Handles what the system cannot' }, 'the support team handles what the system cannot'),
  item({ section: '3.1', type: 'in_scope', text: 'Order status and refunds' }, 'covers order status and refunds'),
  item({ section: '3.1', type: 'out_of_scope', text: 'Returns and exchanges' }, 'returns and exchanges are not part of it'),
  item({ section: '3.2', type: 'person', name: 'Customer', text: 'Asks about orders and refunds' }, 'customer asks where their order is'),
  item({ section: '3.2', type: 'system', name: 'Order system', text: 'Order status and history' }, 'it reads our order system'),
  item({ section: '3.2', type: 'system', name: 'Payment service', text: 'Issues refunds' }, 'issues refunds through the payment service'),
  item({ section: '3.2', type: 'system', name: 'FAQ and terms', text: 'Policy answers' }, 'policies are in our FAQ'),
  { say: 'That covers what discovery needs. Reliability, performance, cost, operations and rollout stay open; we confirm them in the technical design. Shall we approve the scope?' },
  { change: { op: 'approve_stage', stage: 'discovery', by: 'Business sponsor' }, reason: 'Approved in the app', actor: 'user', pauseMs: 1400 },
  { say: 'Approved. Now the solution design, starting with the decisions, each with the options we weighed.' },
  decide('platform', 'Microsoft Foundry', 'Build custom agents in Microsoft Foundry', ['SaaS agents', 'Copilot Studio', 'Microsoft Foundry'], 'Pro-code control over the refund boundary; the team maintains the agents.', 'build it in Foundry'),
  decide('complexity', 'Several agents', 'A triage agent with three specialists', ['One agent with tools', 'Several agents'], 'Only the refund agent may move money: a security boundary. More agents to evaluate and monitor.', 'only the refund part may move money'),
  decide('pattern', 'Handoff', 'Triage hands off to the specialist the request needs', ['Sequential', 'Handoff', 'Group chat'], 'The right specialist is only known after reading the request; one agent works at a time.', 'Handing off to the right specialist is fine'),
  decide('hosting', 'Prompt agents', 'Prompt agents run by Foundry Agent Service', ['Prompt agents', 'Hosted agents'], 'No orchestration code to build, host and run; Foundry keeps the conversation history.', 'rather not run our own servers'),
  { say: 'Now the building blocks, each tied to what it serves. Messages come in from the customer.' },
  add({ kind: 'trigger', name: 'Customer message', source: 'chat', description: 'Chat and web form', serves: ['person-1'] }, 'Where work enters'),
  add({ kind: 'tool', name: 'Order lookup', toolType: 'openapi', description: 'Reads the order system', serves: ['system-1'] }, 'Reaches the order system'),
  add({ kind: 'tool', name: 'Refund API', toolType: 'openapi', description: 'Issues refunds', serves: ['system-2'] }, 'Reaches the payment service'),
  add({ kind: 'knowledge', name: 'Policy docs', source: 'ai_search', description: 'Terms, FAQ and policies', serves: ['system-3'] }, 'Reaches the FAQ and terms'),
  add({ kind: 'memory', name: 'Customer memory', scope: 'user', store: 'foundry_memory', serves: ['requirement-1'] }, 'Returning customers should not repeat themselves'),
  {
    change: { op: 'set_shape', shape: 'multi', reasons: ['security_or_compliance_boundary'] },
    reason: 'Only the refund agent may move money',
  },
  add({ kind: 'agent', name: 'Triage', description: 'Reads intent, hands off', instructions: 'Classify the request and hand it to the right specialist.', memory: ['Customer memory'], serves: ['flow-1', 'requirement-1'] }, 'Routes requests'),
  add({ kind: 'agent', name: 'Order Status', description: 'Answers order questions', tools: ['Order lookup'], serves: ['flow-1', 'metric-1'] }, 'Order questions'),
  add({ kind: 'agent', name: 'Refunds', description: 'Prepares refunds', tools: ['Refund API'], serves: ['flow-1', 'in-scope-1'] }, 'Refund requests'),
  add({ kind: 'agent', name: 'Policy', description: 'Answers policy questions', knowledge: ['Policy docs'], serves: ['goal-1'] }, 'Policy questions'),
  {
    change: { op: 'upsert_team', name: 'Support desk', pattern: 'handoff', members: ['Triage', 'Order Status', 'Refunds', 'Policy'], startAgent: 'Triage', purpose: 'Resolve customer requests' },
    reason: 'Triage hands off to specialists',
  },
  { say: 'Refunds over 100 euros wait for a person, so the approval sits on the path to the refund API.' },
  add({ kind: 'approval', name: 'Refund approval', gates: 'Refund API', condition: 'Refunds over 100 EUR', serves: ['oversight-1'] }, 'Enforces the oversight rule'),
  add({ kind: 'guardrail', name: 'Safety', controls: ['prompt_shields', 'harm_filters'] }, 'Protect every agent'),
  add({ kind: 'output', name: 'Reply to customer', destination: 'chat' }, 'Where answers go'),
  { change: { op: 'connect', from: 'Customer message', to: 'Support desk', label: 'message' }, reason: 'Entry point', pauseMs: 600 },
  { change: { op: 'connect', from: 'Support desk', to: 'Reply to customer', label: 'answer' }, reason: 'Team output', pauseMs: 600 },
  { say: 'And the runtime scenario for the main user flow, step by step, including the approval.' },
  {
    change: {
      op: 'set_scenario',
      flow: 'flow-1',
      title: 'Customer asks for a refund',
      steps: [
        { from: 'Customer', to: 'Customer message', what: 'asks for a refund' },
        { from: 'Customer message', to: 'Triage', what: 'passes the message' },
        { from: 'Triage', to: 'Refunds', what: 'hands off the refund request' },
        { from: 'Refunds', to: 'Refund approval', what: 'over 100 EUR: asks a person' },
        { from: 'Refund approval', to: 'Refund API', what: 'approved: issues the refund' },
        { from: 'Refund API', to: 'Payment service', what: 'pays the refund' },
        { from: 'Refunds', to: 'Reply to customer', what: 'confirms the refund' },
      ],
    },
    reason: 'Realises the user flow',
    basis: { source: 'user', quote: 'asks for a refund' },
  },
  item({ section: '4', type: 'strategy', text: 'Triage with three specialists in Microsoft Foundry; only the refund agent reaches the payment service' }, 'only the refund part may move money'),
  item({ section: '4', type: 'quality_approach', text: 'Order data is shown only after the customer signs in; agents never return another customer\'s order', serves: ['quality-1'] }, 'only logged-in customers can see their orders'),
  { say: 'Every flow, rule and external system now traces to the design.' },
  { say: 'Approve the solution design when it looks right, and we move on to the technical design.' },
  { change: { op: 'approve_stage', stage: 'solution', by: 'Lead architect' }, reason: 'Approved in the app', actor: 'user', pauseMs: 1400 },
  { say: 'Technical design, for the platform and security engineers. First the settings that are hard to change later.' },
  setting('region', 'Sweden Central', 'Customer data stays in the EU', 'Sweden Central works for us'),
  setting('network_isolation', 'Private networking', 'Customer data never crosses the public internet', 'Keep everything private'),
  setting('landing_zone', 'Standalone', 'There is no platform landing zone yet', 'there is no landing zone yet'),
  { say: 'The rules every part follows.' },
  item({ section: '8', type: 'concept', category: 'identity', text: "Every service authenticates with a managed identity; no keys" }, "Use managed identities, no keys"),
  item({ section: '8', type: 'concept', category: 'networking', text: "Every service is reached through a private endpoint" }, "Keep everything private"),
  item({ section: '8', type: 'concept', category: 'observability', text: "Every agent run is traced in Application Insights" }, "Trace every agent run"),
  item({ section: '8', type: 'concept', category: 'content_safety', text: "Prompt Shields and harm filters on every agent" }, "only logged-in customers can see their orders"),
  item({ section: '8', type: 'concept', category: 'evaluation', text: "Each runtime scenario is evaluated before release" }, "test each scenario before release"),
  item({ section: '10', type: 'quality_scenario', text: 'A signed-in customer asks about an order that is not theirs, and gets no details of it', measure: 'No order details returned in any evaluation run', serves: ['quality-1'] }, 'only logged-in customers can see their orders'),
  { say: 'What discovery left open becomes stated assumptions.' },
  item({ section: '11', type: 'assumption', category: 'reliability', text: "No recovery targets until the support team sets them" }, "We have no recovery targets"),
  item({ section: '11', type: 'assumption', category: 'performance', text: "An answer within a minute is fast enough" }, "Answers within a minute are enough"),
  item({ section: '11', type: 'assumption', category: 'cost', text: "No budget limit until the estimate is reviewed" }, "no budget limit yet"),
  item({ section: '11', type: 'assumption', category: 'operations', text: "The support team operates the system day to day" }, "the support team runs it day to day"),
  item({ section: '11', type: 'assumption', category: 'rollout', text: "The first release serves one shop" }, "we go live with one shop first"),
  { say: 'And the Well-Architected review, pillar by pillar, with what is still open.' },
  { say: "Reliability first: simple and traced, but no recovery targets yet, so recovery is an open risk." },
  { change: { op: 'review', checks: [{ code: "RE:01", status: "met", note: "The lowest complexity that meets the refund boundary" }, { code: "RE:02", status: "met", note: "One user flow, with its runtime scenario" }, { code: "RE:03", status: "partly", note: "Order not found hands over to a person; other failures not analysed yet" }, { code: "RE:04", status: "not_met", note: "No recovery targets yet" }, { code: "RE:05", status: "not_met", note: "One region; redundancy not discussed yet" }, { code: "RE:06", status: "partly", note: "Managed services scale; scale rules not set yet" }, { code: "RE:07", status: "partly", note: "A person takes over when an order is not found" }, { code: "RE:08", status: "not_met", note: "Not discussed yet" }, { code: "RE:09", status: "not_met", note: "No recovery targets, so no recovery plan yet" }, { code: "RE:10", status: "met", note: "Every agent run is traced in Application Insights" }] }, reason: 'Reviewed with the user', basis: { source: 'user', quote: "We have no recovery targets" }, pauseMs: 900 },
  { say: "Security: private networking, managed identities and a firewall on the way out. Threat detection and security testing are still open." },
  { change: { op: 'review', checks: [{ code: "SE:01", status: "partly", note: "Follows the baseline Foundry architecture; EU data residency recorded" }, { code: "SE:02", status: "not_met", note: "Not discussed yet" }, { code: "SE:03", status: "partly", note: "Customer and order data identified; no labels yet" }, { code: "SE:04", status: "met", note: "Private network; only the refund agent reaches the payment service" }, { code: "SE:05", status: "met", note: "Managed identities, no keys; only signed-in customers see their orders" }, { code: "SE:06", status: "met", note: "Private endpoints, Web Application Firewall at the entry, egress through Azure Firewall" }, { code: "SE:07", status: "partly", note: "Platform encryption at rest and in transit; nothing more agreed" }, { code: "SE:08", status: "not_met", note: "Not discussed yet" }, { code: "SE:09", status: "met", note: "No keys; TLS certificates in Key Vault" }, { code: "SE:10", status: "partly", note: "Telemetry in Application Insights; no threat detection agreed" }, { code: "SE:11", status: "partly", note: "Prompt Shields on every agent; no security testing plan yet" }, { code: "SE:12", status: "not_met", note: "Not discussed yet" }] }, reason: 'Reviewed with the user', basis: { source: 'user', quote: "Keep everything private" }, pauseMs: 900 },
  { say: "Cost: there is no budget yet, so most cost recommendations stay open until the estimate comes with the compile step." },
  { change: { op: 'review', checks: [{ code: "CO:01", status: "not_met", note: "No budget owner yet" }, { code: "CO:02", status: "not_met", note: "The cost estimate comes with the compile step" }, { code: "CO:03", status: "not_met", note: "Not discussed yet" }, { code: "CO:04", status: "not_met", note: "No budget limit yet" }, { code: "CO:05", status: "not_met", note: "Not discussed yet" }, { code: "CO:06", status: "not_met", note: "Not discussed yet" }, { code: "CO:07", status: "partly", note: "The smallest design that meets the refund boundary" }, { code: "CO:08", status: "partly", note: "One shop first" }, { code: "CO:09", status: "not_met", note: "Not discussed yet" }, { code: "CO:10", status: "not_met", note: "Not discussed yet" }, { code: "CO:11", status: "not_met", note: "Not discussed yet" }, { code: "CO:12", status: "not_met", note: "Not discussed yet" }, { code: "CO:13", status: "partly", note: "Prompt agents: no orchestration code to build or run" }, { code: "CO:14", status: "not_met", note: "Not discussed yet" }] }, reason: 'Reviewed with the user', basis: { source: 'user', quote: "no budget limit yet" }, pauseMs: 900 },
  { say: "Operations: the compiled project brings infrastructure as code and a deployment workflow; incident management is still open." },
  { change: { op: 'review', checks: [{ code: "OE:01", status: "partly", note: "The support team runs it day to day" }, { code: "OE:02", status: "not_met", note: "Not discussed yet" }, { code: "OE:03", status: "not_met", note: "Not discussed yet" }, { code: "OE:04", status: "partly", note: "Each scenario is tested before release" }, { code: "OE:05", status: "met", note: "Compiles to Bicep in an Azure Developer CLI project" }, { code: "OE:06", status: "partly", note: "The compiled project includes a deployment workflow" }, { code: "OE:07", status: "met", note: "Every agent run is traced; diagnostics in Log Analytics" }, { code: "OE:08", status: "not_met", note: "Not discussed yet" }, { code: "OE:09", status: "partly", note: "Each scenario is tested before release" }, { code: "OE:10", status: "not_met", note: "Not discussed yet" }, { code: "OE:11", status: "partly", note: "One shop first" }] }, reason: 'Reviewed with the user', basis: { source: 'user', quote: "the support team runs it day to day" }, pauseMs: 900 },
  { say: "Performance: one minute is the target; capacity and load testing are still open." },
  { change: { op: 'review', checks: [{ code: "PE:01", status: "met", note: "Answers within a minute" }, { code: "PE:02", status: "not_met", note: "Not discussed yet" }, { code: "PE:03", status: "met", note: "Managed Foundry services from the baseline architecture" }, { code: "PE:04", status: "partly", note: "Run telemetry in Application Insights; no baseline yet" }, { code: "PE:05", status: "not_met", note: "Not discussed yet" }, { code: "PE:06", status: "not_met", note: "Not discussed yet" }, { code: "PE:07", status: "not_met", note: "Not discussed yet" }, { code: "PE:08", status: "not_met", note: "Not discussed yet" }, { code: "PE:09", status: "partly", note: "The refund flow is the critical flow; not prioritised yet" }, { code: "PE:10", status: "not_met", note: "Not discussed yet" }, { code: "PE:11", status: "not_met", note: "Not discussed yet" }, { code: "PE:12", status: "not_met", note: "Not discussed yet" }] }, reason: 'Reviewed with the user', basis: { source: 'user', quote: "Answers within a minute are enough" }, pauseMs: 900 },
  { say: 'The deployment view shows every Azure resource this design needs, and the review shows what is still open. Add a Gemini API key to design your own system live.' },
];

/** Plays the demo, one step at a time. Returns a function that stops playback. */
export function playDemo(run: (step: DemoStep) => void, stepMs = 1100): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let i = 0;

  const next = () => {
    if (stopped || i >= DEMO_SCRIPT.length) return;
    const step = DEMO_SCRIPT[i++];
    run(step);
    timer = setTimeout(next, step.pauseMs ?? stepMs);
  };

  timer = setTimeout(next, 600);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
