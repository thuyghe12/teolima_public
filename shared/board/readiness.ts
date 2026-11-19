/**
 * Where a board stands against the design standard (docs/DESIGN_STANDARD.md).
 *
 * Each step of the procedure is checked against the board model. The coach
 * gets the first unfinished step with every tool result, so it works through
 * the standard in order; the app and, later, the compiler read the same list.
 */
import { discovery } from './discovery';
import type { Board, Component } from './schema';

export type StepId = 'discovery' | 'shape' | 'pattern' | 'tools' | 'guardrails' | 'approvals' | 'flow' | 'evaluation';
export type StepStatus = 'done' | 'missing' | 'open' | 'later';

export interface Step {
  id: StepId;
  title: string;
  status: StepStatus;
  detail: string;
}

export interface Readiness {
  steps: Step[];
  /** The first step that is missing or open, in procedure order. */
  next: Step | null;
}

const of = <K extends Component['kind']>(board: Board, kind: K) =>
  board.components.filter((c): c is Extract<Component, { kind: K }> => c.kind === kind);

const list = (names: string[]) => names.map((n) => `"${n}"`).join(', ');

export function readiness(board: Board): Readiness {
  const agents = of(board, 'agent');
  const tools = of(board, 'tool');
  const knowledge = of(board, 'knowledge');
  const guardrails = of(board, 'guardrail');
  const approvals = of(board, 'approval');
  const steps: Step[] = [];
  const step = (id: StepId, title: string, status: StepStatus, detail: string) => steps.push({ id, title, status, detail });

  const d = discovery(board);
  if (!board.brief.goal) {
    step('discovery', 'Discovery', 'missing', 'Ask what the system must achieve, confirm it back, and save it with set_brief.');
  } else if (!d.done) {
    step('discovery', 'Discovery', 'missing', `Ask, one question at a time, and record each answer with record_requirement: ${d.missing.map((t) => t.question).join(' ')}`);
  } else {
    step('discovery', 'Discovery', 'done',
      d.open.length ? `Requirements recorded. Still open, to confirm later: ${d.open.map((t) => t.title.toLowerCase()).join(', ')}.` : 'Requirements recorded for every topic.');
  }

  if (board.shape.kind === 'undecided') {
    step('shape', 'Single agent or several', 'missing',
      'Decide with the user: one agent with tools is the default; several agents only for a security or compliance boundary, several teams, expected growth, prompt complexity or tool overload.');
  } else if (agents.length === 0) {
    step('shape', 'Single agent or several', 'missing', 'Add the first agent.');
  } else {
    step('shape', 'Single agent or several', 'done',
      board.shape.kind === 'single' ? 'One agent with tools.' : `Several agents: ${board.shape.reasons.join(', ').replace(/_/g, ' ')}.`);
  }

  if (board.shape.kind === 'multi') {
    const teamed = new Set(board.teams.flatMap((t) => t.members));
    const loose = agents.filter((a) => !teamed.has(a.id)).map((a) => a.name);
    if (board.teams.length === 0 || agents.length < 2) {
      step('pattern', 'Orchestration pattern', 'missing', 'Add the agents, then put them in a team with the simplest pattern that fits.');
    } else if (loose.length) {
      step('pattern', 'Orchestration pattern', 'open', `Not in a team yet: ${list(loose)}.`);
    } else {
      step('pattern', 'Orchestration pattern', 'done', board.teams.map((t) => `${t.name}: ${t.pattern.replace('_', ' ')}`).join('; '));
    }
  } else {
    step('pattern', 'Orchestration pattern', 'done', 'Not needed for a single agent.');
  }

  // A team's start agent or manager routes work to others, so it may need no tools of its own.
  const routers = new Set(board.teams.flatMap((t) => [t.startAgent, t.manager].filter(Boolean) as string[]));
  const bare = agents.filter((a) => !routers.has(a.id) && a.tools.length === 0 && a.knowledge.length === 0).map((a) => a.name);
  const memories = of(board, 'memory');
  const used = new Set(agents.flatMap((a) => [...a.tools, ...a.knowledge, ...a.memory]));
  const unused = [...tools, ...knowledge, ...memories].filter((c) => !used.has(c.id)).map((c) => c.name);
  if (agents.length === 0) {
    step('tools', 'Tools and knowledge', 'missing', 'Add the tools and knowledge the agents need, then the agents that use them.');
  } else if (bare.length || unused.length) {
    step('tools', 'Tools and knowledge', 'open', [
      bare.length ? `No tools or knowledge yet: ${list(bare)}. Confirm with the user that they need none, or add them.` : '',
      unused.length ? `Not used by any agent: ${list(unused)}.` : '',
    ].filter(Boolean).join(' '));
  } else {
    step('tools', 'Tools and knowledge', 'done', 'Each agent has the tools or knowledge it needs, and nothing is unused.');
  }

  const covered = (agentId: string) =>
    guardrails.some((g) => g.controls.includes('prompt_shields') && (g.appliesTo.length === 0 || g.appliesTo.includes(agentId)));
  const unguarded = agents.filter((a) => !covered(a.id)).map((a) => a.name);
  if (agents.length === 0) {
    step('guardrails', 'Guardrails', 'missing', 'Once there are agents, cover each one with a guardrail that includes Prompt Shields.');
  } else if (unguarded.length) {
    step('guardrails', 'Guardrails', 'missing', `Not covered by a guardrail with Prompt Shields: ${list(unguarded)}.`);
  } else {
    step('guardrails', 'Guardrails', 'done', 'Every agent is covered by Prompt Shields.');
  }

  step('approvals', 'Human approvals', approvals.length ? 'done' : 'open',
    approvals.length
      ? `${approvals.length} approval${approvals.length > 1 ? 's' : ''}, each scoped to the tool or agent it gates.`
      : 'Ask whether any tool takes a high-impact action, such as writing data or moving money. If one does, add an approval scoped to that tool.');

  const hasTrigger = of(board, 'trigger').length > 0;
  const hasOutput = of(board, 'output').length > 0;
  step('flow', 'Where work enters and leaves', hasTrigger && hasOutput ? 'done' : 'missing',
    hasTrigger && hasOutput ? 'Trigger and output are on the board.' : `Add ${hasTrigger ? '' : 'a trigger'}${!hasTrigger && !hasOutput ? ' and ' : ''}${hasOutput ? '' : 'an output'}, and connect them.`);

  step('evaluation', 'Evaluation', 'later', 'The compiler writes an evaluation set from the board\'s own rules.');

  return { steps, next: steps.find((s) => s.status === 'missing' || s.status === 'open') ?? null };
}
