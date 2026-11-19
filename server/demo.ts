/**
 * Demo mode: a recorded coaching session, replayed when no GEMINI_API_KEY is set.
 *
 * The replay builds the board through the same board changes the live coach
 * makes, validated by the same change log and laid out by the same layout.
 * A clone of the repo shows the real experience without credentials, and the
 * script doubles as a fixture for the tests.
 */
import type { Basis, ChangeBody } from '../shared/board/changes';
import type { Requirement } from '../shared/board/schema';

export type DemoStep =
  | { say: string; pauseMs?: number }
  | { change: ChangeBody; reason: string; basis?: Basis; actor?: 'user'; pauseMs?: number };

export const DEMO_GOAL = 'A customer support system that answers order questions and handles refunds safely';

/** What the user tells the coach in the recorded session; every requirement quotes it. */
export const DEMO_USER_WORDS = [
  DEMO_GOAL,
  'Today customers of our web shop wait two days for an answer. Most questions are where is my order or can I get a refund.',
  'I want most order questions answered without a person, around the clock.',
  'It reads our order system and issues refunds through the refund API. Policies are in our FAQ and terms.',
  'Refunds over 100 EUR need a person. Returning customers should not have to repeat themselves.',
  'Customer data must stay in the EU, and only logged-in customers can see their orders.',
];

const req = (kind: Requirement['kind'], text: string, quote: string, pillar?: Requirement['pillar'], name?: string): DemoStep => ({
  change: { op: 'record_requirement', kind, text, ...(pillar ? { pillar } : {}), ...(name ? { name } : {}) },
  reason: 'Stated by the user',
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
  { say: 'Before drawing anything, the specification. I am recording what you told me, each point with your own words as its source.' },
  req('problem', 'Customers wait two days for an answer', 'wait two days for an answer'),
  req('outcome', 'Most order questions are answered without a person, around the clock', 'answered without a person'),
  req('user', 'Customers of the web shop', 'customers of our web shop', undefined, 'Customers'),
  req('scenario', 'A customer asks where an order is, or asks for a refund', 'where is my order'),
  req('integration', 'Reads orders and issues refunds through the refund API', 'issues refunds through the refund API', undefined, 'Order system'),
  req('integration', 'Policies come from the FAQ and terms', 'policies are in our FAQ', undefined, 'FAQ and terms'),
  req('oversight', 'Refunds over 100 EUR need a person', 'refunds over 100 EUR need a person'),
  req('nonfunctional', 'Customer data stays in the EU; only logged-in customers see their orders', 'customer data must stay in the EU', 'security'),
  req('functional', 'Returning customers do not have to repeat themselves', 'should not have to repeat themselves'),
  { say: 'Discovery is complete. Reliability, cost, operations and performance stay open; we confirm them in the technical design. Shall we approve the scope?' },
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
