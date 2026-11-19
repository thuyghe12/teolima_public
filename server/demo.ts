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
  'Refunds over 100 EUR need a person.',
  'Customer data must stay in the EU, and only logged-in customers can see their orders.',
  'The head of support owns this, and the support team handles what the system cannot.',
  'It reads our order system and issues refunds through the payment service. Policies are in our FAQ and terms.',
  'The first version covers order status and refunds. Returns and exchanges are not part of it.',
];

type ItemFields = Omit<Extract<ChangeBody, { op: 'record_item' }>, 'op' | 'id'>;
const item = (fields: ItemFields, quote: string): DemoStep => ({
  change: { op: 'record_item', ...fields },
  reason: 'Stated by the user',
  basis: { source: 'user', quote },
  pauseMs: 450,
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
  { say: 'Approved. Now the solution design, below the context diagram, starting with where messages come in.' },
  add({ kind: 'trigger', name: 'Customer message', source: 'chat', description: 'Chat and web form' }, 'Where work enters'),
  { say: 'Specialists need the right tools. One looks up orders, one issues refunds, and policy answers come from your own documents.' },
  add({ kind: 'tool', name: 'Order lookup', toolType: 'openapi', description: 'Reads the order system' }, 'Order data'),
  add({ kind: 'tool', name: 'Refund API', toolType: 'openapi', description: 'Issues refunds' }, 'Refunds'),
  add({ kind: 'knowledge', name: 'Policy docs', source: 'ai_search', description: 'Terms, FAQ and policies' }, 'Grounding for policy answers'),
  { say: 'Returning customers should not repeat themselves, so the system keeps a memory per customer, in Foundry memory.' },
  add({ kind: 'memory', name: 'Customer memory', scope: 'user', store: 'foundry_memory' }, 'Returning customers should not repeat themselves'),
  { say: 'One agent with tools is the default. Here only the refund agent may move money, which is a security boundary, so we split the work across agents.' },
  {
    change: { op: 'set_shape', shape: 'multi', reasons: ['security_or_compliance_boundary'] },
    reason: 'Only the refund agent may move money',
  },
  { say: 'Now the agents. A triage agent reads each message and passes it to the specialist who can help.' },
  add({ kind: 'agent', name: 'Triage', description: 'Reads intent, hands off', instructions: 'Classify the request and hand it to the right specialist.', memory: ['Customer memory'] }, 'Routes requests'),
  add({ kind: 'agent', name: 'Order Status', description: 'Answers order questions', tools: ['Order lookup'] }, 'Order questions'),
  add({ kind: 'agent', name: 'Refunds', description: 'Prepares refunds', tools: ['Refund API'] }, 'Refund requests'),
  add({ kind: 'agent', name: 'Policy', description: 'Answers policy questions', knowledge: ['Policy docs'] }, 'Policy questions'),
  { say: 'Together they form a handoff team. Triage receives every message first and routes it, like a good receptionist.' },
  {
    change: { op: 'upsert_team', name: 'Support desk', pattern: 'handoff', members: ['Triage', 'Order Status', 'Refunds', 'Policy'], startAgent: 'Triage', purpose: 'Resolve customer requests' },
    reason: 'Triage hands off to specialists',
  },
  { say: 'Moving money cannot be undone, so larger refunds wait for a person to approve them.' },
  add({ kind: 'approval', name: 'Refund approval', gates: 'Refund API', condition: 'Refunds over 100 EUR' }, 'Irreversible action'),
  { say: 'Every agent talks to customers, so one guardrail covers them all: prompt shields and harm filters.' },
  add({ kind: 'guardrail', name: 'Safety', controls: ['prompt_shields', 'harm_filters'] }, 'Protect every agent'),
  add({ kind: 'output', name: 'Reply to customer', destination: 'chat' }, 'Where answers go'),
  { change: { op: 'connect', from: 'Customer message', to: 'Support desk', label: 'message' }, reason: 'Entry point', pauseMs: 600 },
  { change: { op: 'connect', from: 'Support desk', to: 'Reply to customer', label: 'answer' }, reason: 'Team output', pauseMs: 600 },
  { say: 'That is a first version you could deploy. Add a Gemini API key to design your own system live.' },
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
