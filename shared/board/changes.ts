/**
 * Every edit to the board is a change with an actor and a reason.
 *
 * The coach, the user and (later) memory workers never mutate a board
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
import {
  Board,
  Component,
  COMPONENT_KINDS,
  GuardrailControl,
  OrchestrationPattern,
  slug,
  type Id,
  type Team,
} from './schema';

/** Who made a change. Memory workers are named: "worker:constraints". */
export const Actor = z.union([z.literal('coach'), z.literal('user'), z.string().regex(/^worker:[a-z0-9-]{1,40}$/)]);
export type Actor = z.infer<typeof Actor>;

const Ref = z.string().trim().min(1).max(80);
const Refs = z.array(Ref).max(20);

export const ChangeBody = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set_title'), title: z.string().trim().max(120) }),
  z.object({
    op: z.literal('upsert_component'),
    kind: z.enum(COMPONENT_KINDS),
    name: z.string().trim().min(1).max(80),
    description: z.string().optional(),
    instructions: z.string().optional(),
    model: z.string().optional(),
    tools: Refs.optional(),
    knowledge: Refs.optional(),
    toolType: z.string().optional(),
    endpoint: z.string().optional(),
    source: z.string().optional(),
    appliesTo: Refs.optional(),
    controls: z.array(GuardrailControl).optional(),
    gates: Ref.optional(),
    condition: z.string().optional(),
    destination: z.string().optional(),
  }),
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

export const Change = z.object({
  body: ChangeBody,
  actor: Actor,
  reason: z.string().trim().min(1).max(300),
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
      if (c.kind === 'agent') return { ...c, tools: c.tools.filter((t) => t !== id), knowledge: c.knowledge.filter((k) => k !== id) };
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

/** Applies one change. Never throws; a refused change leaves the board unchanged. */
export function applyChange(board: Board, change: Change): ApplyResult {
  const checked = Change.safeParse(change);
  if (!checked.success) return fail(`Invalid change: ${checked.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  const body = checked.data.body;

  let result: ApplyResult;
  switch (body.op) {
    case 'set_title':
      result = { ok: true, board: { ...board, title: body.title }, summary: `Titled the board "${body.title}"`, warnings: [] };
      break;
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
