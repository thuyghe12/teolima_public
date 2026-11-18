/**
 * Demo mode: a recorded coaching session, replayed when no GEMINI_API_KEY is set.
 *
 * The replay goes through the same path as a live session: every step is a
 * tool call validated by server/validation.ts and drawn by the same canvas
 * engine. A clone of the repo shows the real experience without credentials,
 * and the script doubles as a fixture for the tests.
 */
import { validateToolCall, type ToolCall } from './validation';

export type DemoStep =
  | { say: string; pauseMs?: number }
  | { draw: ToolCall; pauseMs?: number };

const node = (label: string, subtext: string, agentRole: string, gridColumn: number, gridRow: number): DemoStep => ({
  draw: { name: 'draw_agent_node', args: { label, subtext, agentRole, gridColumn, gridRow } },
});

const link = (fromNode: string, toNode: string, label: string, style = 'solid'): DemoStep => ({
  draw: { name: 'draw_connection', args: { fromNode, toNode, label, style } },
  pauseMs: 500,
});

export const DEMO_GOAL = 'A customer support system that answers order questions and handles refunds safely';

export const DEMO_SCRIPT: DemoStep[] = [
  { say: "Let's design your customer support system. I'll sketch it as we go, starting with where messages come in." },
  { draw: { name: 'draw_doodle_writing', args: { text: 'Customer Support Agent System', x: 140, y: 110, fontSize: 24, doodleStyle: 'highlight' } } },
  node('Message Intake', 'Email, chat and web form', 'intake', 1, 2),
  { say: 'Every message first goes to a router. It classifies intent and urgency, and it never answers the customer itself.' },
  node('Triage Router', 'Classifies intent and urgency', 'router', 2, 2),
  link('Message Intake', 'Triage Router', 'raw message'),
  { say: 'Behind the router, each specialist does one job. Order questions, refunds and policy questions stay separate.' },
  node('Order Status Agent', 'Reads the order system', 'agent', 3, 1),
  node('Refund Agent', 'Drafts refunds, never pays out', 'agent', 3, 2),
  node('Policy Search', 'Retrieves FAQ and terms', 'tool', 3, 3),
  link('Triage Router', 'Order Status Agent', 'order questions'),
  link('Triage Router', 'Refund Agent', 'refund requests'),
  link('Triage Router', 'Policy Search', 'policy questions'),
  { say: 'Moving money is irreversible, so a refund proposal always stops at a human approval gate.' },
  node('Human Approval', 'Refunds over 100 EUR', 'human_approval', 4, 2),
  link('Refund Agent', 'Human Approval', 'refund proposal'),
  { say: 'Every outgoing reply passes one output guardrail that checks for personal data and policy breaches.' },
  node('Output Guardrail', 'PII and policy checks', 'guardrail', 4, 1),
  link('Order Status Agent', 'Output Guardrail', 'draft reply'),
  link('Human Approval', 'Output Guardrail', 'approved reply'),
  { say: 'Finally, memory. The router reads the customer history, so a returning customer never has to repeat themselves.' },
  node('Conversation Memory', 'Per-customer history', 'memory', 4, 3),
  link('Triage Router', 'Conversation Memory', 'context', 'dashed'),
  {
    draw: {
      name: 'draw_callout',
      args: { text: 'Irreversible actions always need a human', x: 140, y: 560 },
    },
  },
  { say: 'That is the full first version. Add a Gemini API key to talk it through live and change it as we go.' },
];

/** Validated copy of the script; throws at startup if the script itself is invalid. */
export function compiledDemoScript(): DemoStep[] {
  return DEMO_SCRIPT.map((step) => {
    if (!('draw' in step)) return step;
    const checked = validateToolCall(step.draw);
    if (!checked.ok || !checked.call || checked.dropped.length > 0) {
      throw new Error(`Invalid demo step ${step.draw.name}: ${checked.error ?? checked.dropped.join(', ')}`);
    }
    return { ...step, draw: checked.call };
  });
}

/**
 * Plays the demo through `send`. Returns a function that stops playback.
 * `send` receives the same message shapes as a live session.
 */
export function playDemo(send: (msg: unknown) => void, stepMs = 1100): () => void {
  const steps = compiledDemoScript();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let i = 0;

  const next = () => {
    if (stopped || i >= steps.length) return;
    const step = steps[i++];
    if ('say' in step) {
      send({ type: 'transcript', transcript: { speaker: 'ai', text: step.say } });
    } else {
      send({ type: 'tool_call', toolCalls: [{ id: `demo-${i}`, ...step.draw }] });
    }
    timer = setTimeout(next, step.pauseMs ?? stepMs);
  };

  timer = setTimeout(next, 600);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
