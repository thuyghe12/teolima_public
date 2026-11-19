/**
 * The stages of the architect's process.
 *
 * Microsoft's diagram guidance asks the architect to choose diagram types
 * that match the message, the audience and the lifecycle stage, and to
 * disclose progressively: a context diagram first, then a more detailed one.
 * Teolima follows that as four stages, each with its own people in the room,
 * its own diagram and its own gate:
 *
 *   1 discovery   context diagram and functional specification   business sponsor
 *   2 solution    high-level design of agents, tools and flow     architect
 *   3 technical   deployment diagram and design specification     security and platform
 *   4 compile     the deployment package                          delivery owner
 *
 * In each stage only that stage's changes are accepted, so the coach cannot
 * jump ahead or quietly change what an earlier stage approved. Moving on
 * takes a person's approval in the app; the change log refuses an approval
 * from anyone but the user, and refuses it before the stage's gate is met.
 */
import { discovery } from './discovery';
import { readiness, type StepId } from './readiness';
import type { Board, StageId } from './schema';
import { CONCEPTS, DECISION_TOPICS, DEPLOYMENT_SETTINGS, hostingOf } from './arc42';
import { resourcePlan } from './deployment';
import { CHECKLIST } from './waf';

export interface Stage {
  id: StageId;
  n: number;
  title: string;
  /** What the stage produces. */
  artifact: string;
  /** Who should be in the room. */
  audience: string;
  /** Who approves it. */
  approver: string;
  /** The changes accepted while this stage is current. */
  ops: string[];
  /** The design standard steps that belong to this stage. */
  steps: StepId[];
}

export const STAGES: Stage[] = [
  {
    id: 'discovery',
    n: 1,
    title: 'Discovery',
    artifact: 'Context diagram and functional specification',
    audience: 'Business sponsor, product owner and presales architect',
    approver: 'Business sponsor',
    ops: ['set_brief', 'set_title'],
    steps: ['discovery'],
  },
  {
    id: 'solution',
    n: 2,
    title: 'Solution design',
    artifact: 'High-level design: agents, teams, tools, knowledge, memory, guardrails and flow',
    audience: "Architect and the client's tech lead",
    approver: 'Architect',
    ops: ['set_title', 'set_shape', 'upsert_component', 'remove_component', 'upsert_team', 'remove_team', 'connect', 'disconnect', 'clear', 'set_scenario', 'remove_scenario'],
    steps: ['shape', 'pattern', 'tools', 'guardrails', 'approvals', 'flow'],
  },
  {
    id: 'technical',
    n: 3,
    title: 'Technical design',
    artifact: 'Deployment diagram and design specification',
    audience: 'Platform, security and operations engineers',
    approver: 'Security and platform leads',
    ops: ['set_title', 'review'],
    steps: [],
  },
  {
    id: 'compile',
    n: 4,
    title: 'Compile',
    artifact: 'Deployment package: Bicep, agent definitions, cost estimate',
    audience: 'Delivery engineer',
    approver: 'Delivery owner',
    ops: [],
    steps: [],
  },
];

export const stageOf = (id: StageId): Stage => STAGES.find((s) => s.id === id)!;

/** Whether a stage's work is complete enough to ask for approval, and what is missing if not. */
export function gate(board: Board, id: StageId): { ready: boolean; missing: string[] } {
  if (id === 'discovery') {
    const missing = [...(board.brief.goal ? [] : ['the goal']), ...discovery(board).missing.map((t) => t.title.toLowerCase())];
    return { ready: missing.length === 0, missing };
  }
  if (id === 'solution') {
    const steps = readiness(board).steps.filter((s) => stageOf('solution').steps.includes(s.id) && s.status !== 'done' && s.status !== 'later');
    const missing = [...steps.map((s) => s.title.toLowerCase()), ...traceability(board)];
    return { ready: missing.length === 0, missing };
  }
  if (id === 'technical') {
    const missing = technicalGaps(board);
    return { ready: missing.length === 0, missing };
  }
  return { ready: false, missing: ['the export checks and approval, in the project view'] };
}

/**
 * What technical design must settle before the security and platform leads
 * can approve it, so the compile wizard only confirms: the deployment
 * settings that are hard to change later, the crosscutting concepts every
 * block follows, a quality scenario with a measure for every quality goal, an
 * assumption for every discovery topic left open, the Well-Architected review
 * of every recommendation, and nothing the resource plan cannot decide.
 */
export function technicalGaps(board: Pick<Board, 'spec' | 'components'>): string[] {
  const items = board.spec.items;
  const out: string[] = [];
  for (const [k, v] of Object.entries(DEPLOYMENT_SETTINGS)) {
    if (v.required && !items.some((i) => i.type === 'setting' && i.category === k)) out.push(`the ${v.label.toLowerCase()} setting`);
  }
  for (const [k, v] of Object.entries(CONCEPTS)) {
    if (v.required && !items.some((i) => i.type === 'concept' && i.category === k)) out.push(`the ${v.label.toLowerCase()} concept`);
  }
  for (const goal of items.filter((i) => i.section === '1.2')) {
    if (!items.some((i) => i.type === 'quality_scenario' && i.serves?.includes(goal.id))) out.push(`a quality scenario for ${goal.id}`);
  }
  for (const t of discovery(board).open) {
    if (!items.some((i) => i.type === 'assumption' && i.category === t.id)) out.push(`an assumption on ${t.title.toLowerCase()}, left open in discovery`);
  }
  const reviewed = new Set(board.spec.reviews.map((r) => r.code));
  const unreviewed = CHECKLIST.filter((r) => !reviewed.has(r.code)).map((r) => r.code);
  if (unreviewed.length) out.push(`the Well-Architected review of ${unreviewed.length === CHECKLIST.length ? 'all recommendations' : unreviewed.join(', ')}`);
  out.push(...resourcePlan(board).open);
  return out;
}

/**
 * What solution design must trace back to discovery before it can be
 * approved, so the compiler never has to guess: every user flow has a
 * runtime scenario, every oversight rule an approval that enforces it, every
 * external system a tool or knowledge source that reaches it, every agent at
 * least one item it serves, and the required decisions are on record.
 */
export function traceability(board: Pick<Board, 'spec' | 'components' | 'teams' | 'shape'>): string[] {
  const items = board.spec.items;
  const out: string[] = [];
  const exists = (id: string) => items.some((i) => i.id === id) || board.components.some((c) => c.id === id) || board.teams.some((t) => t.id === id);
  for (const sc of board.spec.scenarios) {
    const gone = [...new Set(sc.steps.flatMap((st) => [st.from, st.to]).filter((id) => !exists(id)))];
    if (gone.length) out.push(`${sc.id}: steps that refer to ${gone.join(', ')}, which is no longer on the board`);
  }
  for (const c of board.components) {
    const gone = c.serves.filter((id) => !items.some((i) => i.id === id));
    if (gone.length) out.push(`"${c.name}" serves ${gone.join(', ')}, which is no longer in the specification`);
  }
  for (const flow of items.filter((i) => i.type === 'flow')) {
    if (!board.spec.scenarios.some((s) => s.flow === flow.id)) out.push(`a runtime scenario for ${flow.id}`);
  }
  for (const rule of items.filter((i) => i.type === 'oversight')) {
    if (!board.components.some((c) => c.kind === 'approval' && c.serves.includes(rule.id)) && !items.some((i) => i.type === 'decision' && i.serves?.includes(rule.id))) {
      out.push(`an approval that enforces ${rule.id}, or a decision on how it is met`);
    }
  }
  for (const sys of items.filter((i) => i.section === '3.2' && i.type === 'system')) {
    if (!board.components.some((c) => (c.kind === 'tool' || c.kind === 'knowledge') && c.serves.includes(sys.id))) out.push(`a tool or knowledge source that reaches ${sys.name ?? sys.id}`);
  }
  for (const agent of board.components.filter((c) => c.kind === 'agent')) {
    if (!agent.serves.length) out.push(`what agent "${agent.name}" serves`);
  }
  const decided = new Set(items.filter((i) => i.type === 'decision').map((i) => i.topic));
  const needed: (keyof typeof DECISION_TOPICS)[] = ['platform', 'complexity', 'hosting', ...(board.shape.kind === 'multi' ? (['pattern'] as const) : [])];
  for (const t of needed) if (!decided.has(t)) out.push(`a decision record on ${DECISION_TOPICS[t].label.toLowerCase()}`);
  // A team's pattern is code: Foundry Agent Service runs prompt agents one at a time, and the
  // baseline names explicit orchestration patterns as a reason for hosted agents.
  const hosting = hostingOf(items.find((i) => i.type === 'decision' && i.topic === 'hosting')?.name);
  if (hosting === 'Prompt agents' && board.teams.length) {
    out.push(`a hosting decision that runs the ${board.teams.map((t) => t.pattern.replace('_', ' ')).join(' and ')} orchestration in code (hosted agents or self-hosted orchestration): prompt agents run one at a time`);
  }
  return out;
}

/** Changes to the stage documents: accepted in every stage, for the current stage's sections only (checked in changes.ts). */
export const DOCUMENT_OPS = ['record_item', 'remove_item', 'add_section', 'rename_section', 'remove_section'];

/** The refusal for a change that does not belong to the current stage. */
export function outOfStage(board: Board, op: string): string | null {
  if (op === 'approve_stage' || op === 'reopen_stage' || DOCUMENT_OPS.includes(op)) return null;
  const stage = stageOf(board.stage.current);
  if (stage.ops.includes(op)) return null;
  const home = STAGES.find((s) => s.ops.includes(op));
  if (home && home.n < stage.n) {
    return `${home.title} is approved, so this change is refused. The user can reopen ${home.title.toLowerCase()} in the app; then later stages need approval again.`;
  }
  if (home) {
    return `This belongs to ${home.title.toLowerCase()}, and the current stage is ${stage.title.toLowerCase()}. Finish this stage; the user approves it in the app before the next one starts.`;
  }
  return `That change is not part of ${stage.title.toLowerCase()}.`;
}
