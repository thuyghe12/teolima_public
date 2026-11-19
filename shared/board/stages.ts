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
    ops: ['set_title', 'set_shape', 'upsert_component', 'remove_component', 'upsert_team', 'remove_team', 'connect', 'disconnect', 'clear'],
    steps: ['shape', 'pattern', 'tools', 'guardrails', 'approvals', 'flow'],
  },
  {
    id: 'technical',
    n: 3,
    title: 'Technical design',
    artifact: 'Deployment diagram and design specification',
    audience: 'Platform, security and operations engineers',
    approver: 'Security and platform leads',
    ops: ['set_title'],
    steps: ['evaluation'],
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
    return { ready: steps.length === 0, missing: steps.map((s) => s.title.toLowerCase()) };
  }
  return { ready: false, missing: ['this stage is not built yet'] };
}

/** The refusal for a change that does not belong to the current stage. */
/** Changes to the stage documents: accepted in every stage, for the current stage's sections only (checked in changes.ts). */
export const DOCUMENT_OPS = ['record_item', 'remove_item', 'add_section', 'rename_section', 'remove_section'];

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
