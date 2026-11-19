/**
 * Every edit to the board is a change with an actor and a reason.
 *
 * The coach, the user and (later) specialist workers never mutate a board
 * directly: they submit changes, and applyChange either returns the next
 * board or refuses with a reason the caller can act on. The same list of
 * changes always replays to the same board, which is what lets the change
 * log become git commits (docs/adr/0001).
 *
 * Components are addressed by id or by name; a name resolves to the same
 * id every time (slug), so "add Refund Agent" twice updates one agent
 * instead of creating two.
 */
import { z } from 'zod';
import { discovery, discoveryRefusal } from './discovery';
import {
  Board,
  Component,
  COMPONENT_KINDS,
  GuardrailControl,
  OrchestrationPattern,
  Pillar,
  REQUIREMENT_KINDS,
  ShapeReason,
  slug,
  type Id,
  type Team,
} from './schema';

/** Who made a change. Workers are named: "worker:network". */
export const Actor = z.union([z.literal('coach'), z.literal('user'), z.string().regex(/^worker:[a-z0-9-]{1,40}$/)]);
export type Actor = z.infer<typeof Actor>;

const Ref = z.string().trim().min(1).max(80);
const Refs = z.array(Ref).max(20);

export const ChangeBody = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set_title'), title: z.string().trim().max(120) }),
  z.object({ op: z.literal('clear') }),
  z.object({ op: z.literal('set_shape'), shape: z.enum(['single', 'multi']), reasons: z.array(ShapeReason).max(5).optional() }),
  z.object({
    op: z.literal('set_brief'),
    goal: z.string().trim().max(600).optional(),
    audience: z.string().trim().max(200).optional(),
    constraints: z.array(z.string().trim().min(1).max(200)).max(12).optional(),
  }),
  z.object({
    op: z.literal('upsert_component'),
    kind: z.enum(COMPONENT_KINDS),
    name: z.string().trim().min(1).max(80),
    description: z.string().optional(),
    instructions: z.string().optional(),
    model: z.string().optional(),
    tools: Refs.optional(),
    knowledge: Refs.optional(),
    memory: Refs.optional(),
    history: z.enum(['service', 'client']).optional(),
    scope: z.string().optional(),
    store: z.string().optional(),
    toolType: z.string().optional(),
    endpoint: z.string().optional(),
    source: z.string().optional(),
    appliesTo: Refs.optional(),
    controls: z.array(GuardrailControl).optional(),
    gates: Ref.optional(),
    condition: z.string().optional(),
    destination: z.string().optional(),
  }),
  z.object({
    op: z.literal('record_requirement'),
    /** An existing requirement to update; omit to add one. */
    id: Ref.optional(),
    kind: z.enum(REQUIREMENT_KINDS),
    text: z.string().trim().min(1).max(300),
    pillar: Pillar.optional(),
  }),
  z.object({ op: z.literal('remove_requirement'), ref: Ref }),
  z.object({ op: z.literal('remove_component'), ref: Ref }),
  z.object({
    op: z.literal('upsert_team'),
    name: z.string().trim().min(1).max(80),
    pattern: OrchestrationPattern,
    members: Refs.min(1),
    manager: Ref.optional(),
    startAgent: Ref.optional(),
    purpose: z.string().optional(),
  }),
  z.object({ op: z.literal('remove_team'), ref: Ref }),
  z.object({ op: z.literal('connect'), from: Ref, to: Ref, label: z.string().trim().max(60).optional() }),
  z.object({ op: z.literal('disconnect'), from: Ref, to: Ref }),
]);
export type ChangeBody = z.infer<typeof ChangeBody>;

/** What a change rests on, quoted: the brief, the user's own words, or a document the user pasted. */
export const Basis = z.object({
  source: z.enum(['brief', 'user', 'document']),
  /** The pasted document, for source document. */
  document: z.string().trim().max(40).optional(),
  quote: z.string().trim().min(1).max(300),
});
export type Basis = z.infer<typeof Basis>;

export const Change = z.object({
  body: ChangeBody,
  actor: Actor,
  reason: z.string().trim().min(1).max(300),
  basis: Basis.optional(),
  at: z.string().datetime(),
});
export type Change = z.infer<typeof Change>;

export type ApplyResult =
  | { ok: true; board: Board; summary: string; warnings: string[] }
  | { ok: false; error: string };

const fail = (error: string): ApplyResult => ({ ok: false, error });

/** Finds a component by id or by name. */
export function findComponent(board: Board, ref: string): Component | undefined {
  const id = slug(ref);
  return board.components.find((c) => c.id === ref || c.id === id || c.name.toLowerCase() === ref.trim().toLowerCase());
}

function findTeam(board: Board, ref: string): Team | undefined {
  const id = slug(ref);
  return board.teams.find((t) => t.id === ref || t.id === id || t.name.toLowerCase() === ref.trim().toLowerCase());
}

/** Resolves references to ids of one or more kinds; returns the first missing reference instead. */
function resolveAll(board: Board, refs: string[], kinds: string[]): { ids: Id[] } | { missing: string } {
  const ids: Id[] = [];
  for (const ref of refs) {
    const c = findComponent(board, ref);
    if (!c || !kinds.includes(c.kind)) return { missing: ref };
    if (!ids.includes(c.id)) ids.push(c.id);
  }
  return { ids };
}

const defined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

function upsertComponent(board: Board, body: Extract<ChangeBody, { op: 'upsert_component' }>): ApplyResult {
  const existing = findComponent(board, body.name);
  if (existing && existing.kind !== body.kind) {
    return fail(`"${existing.name}" already exists as a ${existing.kind}. Remove it first or choose another name.`);
  }
  const id = existing?.id ?? slug(body.name);
  if (!existing && board.teams.some((t) => t.id === id)) return fail(`"${body.name}" is already the name of a team.`);

  const refs: Record<string, unknown> = {};
  if (body.tools) {
    const r = resolveAll(board, body.tools, ['tool']);
    if ('missing' in r) return fail(`Tool "${r.missing}" is not on the board. Add it first.`);
    refs.tools = r.ids;
  }
  if (body.knowledge) {
    const r = resolveAll(board, body.knowledge, ['knowledge']);
    if ('missing' in r) return fail(`Knowledge source "${r.missing}" is not on the board. Add it first.`);
    refs.knowledge = r.ids;
  }
  if (body.memory) {
    const r = resolveAll(board, body.memory, ['memory']);
    if ('missing' in r) return fail(`Memory "${r.missing}" is not on the board. Add it first.`);
    refs.memory = r.ids;
  }
  if (body.appliesTo) {
    const r = resolveAll(board, body.appliesTo, ['agent']);
    if ('missing' in r) return fail(`Agent "${r.missing}" is not on the board.`);
    refs.appliesTo = r.ids;
  }
  if (body.gates) {
    const target = findComponent(board, body.gates);
    if (!target || (target.kind !== 'tool' && target.kind !== 'agent')) {
      return fail(`An approval gates a tool or an agent on the board; "${body.gates}" is neither.`);
    }
    refs.gates = target.id;
  }

  const { op: _op, kind, ...fields } = body;
  const merged = { ...(existing ?? {}), ...defined(fields), ...refs, id, kind, name: body.name };
  const parsed = Component.safeParse(merged);
  if (!parsed.success) return fail(`Invalid ${kind}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);

  const components = existing
    ? board.components.map((c) => (c.id === id ? parsed.data : c))
    : [...board.components, parsed.data];
  return { ok: true, board: { ...board, components }, summary: `${existing ? 'Updated' : 'Added'} ${kind} "${body.name}"`, warnings: [] };
}

function removeComponent(board: Board, ref: string): ApplyResult {
  const target = findComponent(board, ref);
  if (!target) return fail(`"${ref}" is not on the board.`);
  const id = target.id;

  const components = board.components
    // an approval without its gated component means nothing
    .filter((c) => c.id !== id && !(c.kind === 'approval' && c.gates === id))
    .map((c) => {
      if (c.kind === 'agent') {
        return { ...c, tools: c.tools.filter((t) => t !== id), knowledge: c.knowledge.filter((k) => k !== id), memory: c.memory.filter((m) => m !== id) };
      }
      if (c.kind === 'guardrail') return { ...c, appliesTo: c.appliesTo.filter((a) => a !== id) };
      return c;
    });
  const teams = board.teams
    .map((t) => ({
      ...t,
      members: t.members.filter((m) => m !== id),
      manager: t.manager === id ? undefined : t.manager,
      startAgent: t.startAgent === id ? undefined : t.startAgent,
    }))
    .filter((t) => t.members.length > 0);
  const kept = new Set([...components.map((c) => c.id), ...teams.map((t) => t.id)]);
  const connections = board.connections.filter((c) => kept.has(c.from) && kept.has(c.to));
  return { ok: true, board: { ...board, components, teams, connections }, summary: `Removed ${target.kind} "${target.name}"`, warnings: [] };
}

function upsertTeam(board: Board, body: Extract<ChangeBody, { op: 'upsert_team' }>): ApplyResult {
  const r = resolveAll(board, body.members, ['agent']);
  if ('missing' in r) return fail(`Agent "${r.missing}" is not on the board. Add the agents before the team.`);
  const id = findTeam(board, body.name)?.id ?? slug(body.name);
  if (board.components.some((c) => c.id === id)) return fail(`"${body.name}" is already the name of a component.`);

  const taken = board.teams.find((t) => t.id !== id && t.members.some((m) => r.ids.includes(m)));
  if (taken) {
    const agent = r.ids.find((m) => taken.members.includes(m));
    return fail(`Agent "${agent}" is already in team "${taken.name}". An agent belongs to one team.`);
  }

  const one = (ref: string | undefined, label: string) => {
    if (!ref) return { id: undefined as Id | undefined };
    const c = findComponent(board, ref);
    if (!c || c.kind !== 'agent') return { error: `${label} "${ref}" is not an agent on the board.` };
    return { id: c.id };
  };
  const manager = one(body.manager, 'Manager');
  if ('error' in manager) return fail(manager.error as string);
  const start = one(body.startAgent, 'Start agent');
  if ('error' in start) return fail(start.error as string);
  if (start.id && !r.ids.includes(start.id)) return fail('The start agent must be one of the team members.');

  const warnings: string[] = [];
  if ((body.pattern === 'group_chat' || body.pattern === 'magentic') && !manager.id) {
    warnings.push(`A ${body.pattern.replace('_', ' ')} team is coordinated by a manager. Name one before compiling.`);
  }
  if (body.pattern === 'handoff' && !start.id) warnings.push('A handoff team needs a start agent. Name one before compiling.');
  if (body.pattern !== 'sequential' && body.pattern !== 'concurrent' && r.ids.length < 2) {
    warnings.push(`A ${body.pattern.replace('_', ' ')} team needs at least two agents.`);
  }

  const team: Team = {
    id,
    name: body.name,
    pattern: body.pattern,
    purpose: body.purpose ?? findTeam(board, body.name)?.purpose ?? '',
    members: r.ids,
    ...(manager.id ? { manager: manager.id } : {}),
    ...(start.id ? { startAgent: start.id } : {}),
  };
  const exists = board.teams.some((t) => t.id === id);
  const teams = exists ? board.teams.map((t) => (t.id === id ? team : t)) : [...board.teams, team];
  return { ok: true, board: { ...board, teams }, summary: `${exists ? 'Updated' : 'Added'} ${body.pattern} team "${body.name}"`, warnings };
}

/** A connection end: a component, or a whole team (its input or its result). */
function findEnd(board: Board, ref: string): { id: Id; name: string } | undefined {
  return findComponent(board, ref) ?? findTeam(board, ref);
}

function connect(board: Board, body: Extract<ChangeBody, { op: 'connect' }>): ApplyResult {
  const from = findEnd(board, body.from);
  const to = findEnd(board, body.to);
  if (!from) return fail(`"${body.from}" is not on the board.`);
  if (!to) return fail(`"${body.to}" is not on the board.`);
  if (from.id === to.id) return fail('A component cannot connect to itself.');
  const id = `${from.id}--${to.id}`.slice(0, 63);
  const connection = { id, from: from.id, to: to.id, label: body.label ?? '' };
  const exists = board.connections.some((c) => c.id === id);
  const connections = exists ? board.connections.map((c) => (c.id === id ? connection : c)) : [...board.connections, connection];
  return { ok: true, board: { ...board, connections }, summary: `${exists ? 'Relabelled' : 'Connected'} "${from.name}" to "${to.name}"`, warnings: [] };
}

const agentCount = (board: Board) => board.components.filter((c) => c.kind === 'agent').length;

/** Single agent or several, with the reason that justifies several. */
function setShape(board: Board, kind: 'single' | 'multi', reasons: ShapeReason[]): ApplyResult {
  if (kind === 'multi' && reasons.length === 0) {
    return fail('A multi-agent design needs a reason: a security or compliance boundary, several teams, expected growth, prompt complexity or tool overload. Without one, use a single agent with tools.');
  }
  if (kind === 'single' && (agentCount(board) > 1 || board.teams.length > 0)) {
    return fail('The board has several agents or a team. Remove them before choosing a single agent.');
  }
  const unique = [...new Set(reasons)];
  return {
    ok: true,
    board: { ...board, shape: { kind, reasons: kind === 'multi' ? unique : [] } },
    summary: kind === 'multi' ? `Chose a multi-agent design (${unique.join(', ')})` : 'Chose a single agent with tools',
    warnings: [],
  };
}

function recordRequirement(board: Board, body: Extract<ChangeBody, { op: 'record_requirement' }>, basis: Basis | undefined): ApplyResult {
  if (!basis) return fail('A requirement needs its source: the brief, the user\'s words or a pasted document, quoted.');
  if (basis.source === 'document' && !basis.document) return fail('Name the document the quote comes from.');
  if (body.kind === 'nonfunctional' && !body.pillar) {
    return fail('A nonfunctional requirement belongs to a pillar: reliability, security, cost-optimization, operational-excellence or performance-efficiency.');
  }
  if (body.pillar && body.kind !== 'nonfunctional' && body.kind !== 'constraint') {
    return fail('Only nonfunctional requirements and constraints take a pillar.');
  }
  const reqs = board.spec.requirements;
  const existing = body.id ? reqs.find((r) => r.id === body.id) : reqs.find((r) => r.kind === body.kind && r.text.toLowerCase() === body.text.toLowerCase());
  if (body.id && !existing) return fail(`Requirement "${body.id}" is not in the specification.`);
  let id = existing?.id;
  if (!id) {
    let n = reqs.filter((r) => r.kind === body.kind).length + 1;
    while (reqs.some((r) => r.id === `${body.kind}-${n}`)) n++;
    id = `${body.kind}-${n}`;
  }
  const requirement = {
    id,
    kind: body.kind,
    text: body.text,
    ...(body.pillar ? { pillar: body.pillar } : {}),
    source: { kind: basis.source, ...(basis.document ? { document: basis.document } : {}), quote: basis.quote },
  };
  const requirements = existing ? reqs.map((r) => (r.id === id ? requirement : r)) : [...reqs, requirement];
  return {
    ok: true,
    board: { ...board, spec: { requirements } },
    summary: `${existing ? 'Updated' : 'Recorded'} ${body.kind} requirement ${id}`,
    warnings: [],
  };
}

const NEEDS_MULTI =
  'One agent with tools is the default. A second agent or a team needs a multi-agent decision: agree a reason with the user (security or compliance boundary, several teams, expected growth, prompt complexity, tool overload), then call set_shape.';

/** Applies one change. Never throws; a refused change leaves the board unchanged. */
export function applyChange(board: Board, change: Change): ApplyResult {
  const checked = Change.safeParse(change);
  if (!checked.success) return fail(`Invalid change: ${checked.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  const body = checked.data.body;

  // Nothing is designed before the goal is known.
  const needsGoal = !['set_brief', 'set_title', 'clear', 'remove_component', 'remove_team', 'disconnect', 'record_requirement', 'remove_requirement'].includes(body.op);
  if (needsGoal && !board.brief.goal) {
    return fail('No goal yet. Ask the user what the system must achieve, who uses it and its constraints, confirm it back, then save it with set_brief.');
  }

  // Nothing is designed before discovery is done (docs/DESIGN_STANDARD.md, step 1).
  const designs = ['set_shape', 'upsert_component', 'upsert_team', 'connect'].includes(body.op);
  if (designs) {
    const d = discovery(board);
    if (!d.done) return fail(discoveryRefusal(d));
  }

  // A second agent or a team needs a reason (docs/DESIGN_STANDARD.md, step 2).
  if (board.shape.kind !== 'multi') {
    if (body.op === 'upsert_team') return fail(NEEDS_MULTI);
    if (body.op === 'upsert_component' && body.kind === 'agent' && agentCount(board) >= 1) {
      const id = slug(body.name);
      if (!board.components.some((c) => c.id === id)) return fail(NEEDS_MULTI);
    }
  }

  let result: ApplyResult;
  switch (body.op) {
    case 'set_brief': {
      const brief = {
        goal: body.goal ?? board.brief.goal,
        audience: body.audience ?? board.brief.audience,
        constraints: body.constraints ?? board.brief.constraints,
      };
      if (!brief.goal) return fail('A brief needs a goal.');
      result = { ok: true, board: { ...board, brief }, summary: 'Saved the brief', warnings: [] };
      break;
    }
    case 'set_title':
      result = { ok: true, board: { ...board, title: body.title }, summary: `Titled the board "${body.title}"`, warnings: [] };
      break;
    case 'clear':
      result = {
        ok: true,
        board: { ...board, shape: { kind: 'undecided', reasons: [] }, components: [], teams: [], connections: [] },
        summary: 'Cleared the board',
        warnings: [],
      };
      break;
    case 'set_shape':
      result = setShape(board, body.shape, body.reasons ?? []);
      break;
    case 'record_requirement':
      result = recordRequirement(board, body, checked.data.basis);
      break;
    case 'remove_requirement': {
      const target = board.spec.requirements.find((r) => r.id === body.ref);
      result = target
        ? { ok: true, board: { ...board, spec: { requirements: board.spec.requirements.filter((r) => r.id !== target.id) } }, summary: `Removed requirement ${target.id}`, warnings: [] }
        : fail(`Requirement "${body.ref}" is not in the specification.`);
      break;
    }
    case 'upsert_component':
      result = upsertComponent(board, body);
      break;
    case 'remove_component':
      result = removeComponent(board, body.ref);
      break;
    case 'upsert_team':
      result = upsertTeam(board, body);
      break;
    case 'remove_team': {
      const team = findTeam(board, body.ref);
      result = team
        ? {
            ok: true,
            board: {
              ...board,
              teams: board.teams.filter((t) => t.id !== team.id),
              connections: board.connections.filter((c) => c.from !== team.id && c.to !== team.id),
            },
            summary: `Removed team "${team.name}"`,
            warnings: [],
          }
        : fail(`Team "${body.ref}" is not on the board.`);
      break;
    }
    case 'connect':
      result = connect(board, body);
      break;
    case 'disconnect': {
      const from = findEnd(board, body.from);
      const to = findEnd(board, body.to);
      const id = from && to ? `${from.id}--${to.id}` : '';
      result = board.connections.some((c) => c.id === id)
        ? { ok: true, board: { ...board, connections: board.connections.filter((c) => c.id !== id) }, summary: `Disconnected "${from!.name}" from "${to!.name}"`, warnings: [] }
        : fail(`There is no connection from "${body.from}" to "${body.to}".`);
      break;
    }
  }

  if (!result.ok) return result;
  const valid = Board.safeParse(result.board);
  if (!valid.success) return fail(`That change would make the board invalid: ${valid.error.issues[0]?.message}`);
  return { ...result, board: valid.data };
}

/** Rebuilds a board from its change log. Refused changes are skipped, exactly as when they were first applied. */
export function replay(start: Board, changes: Change[]): Board {
  return changes.reduce((board, change) => {
    const r = applyChange(board, change);
    return r.ok ? r.board : board;
  }, start);
}
