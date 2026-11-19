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
import { gate, outOfStage, stageOf, STAGES } from './stages';
import { CONSTRAINT_CATEGORIES, QUALITY_ATTRIBUTES, sectionDef } from './arc42';
import {
  Board,
  Component,
  COMPONENT_KINDS,
  GuardrailControl,
  OrchestrationPattern,
  ShapeReason,
  SpecItem,
  StageId,
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
    /** Ids of the stage document items this block serves. */
    serves: Refs.optional(),
  }),
  z.object({
    op: z.literal('record_item'),
    /** An existing item to update; omit to add one. */
    id: Ref.optional(),
    section: z.string().trim().min(1).max(64),
    type: z.string().trim().min(1).max(40),
    text: z.string().trim().min(1).max(300),
    name: z.string().trim().min(1).max(40).optional(),
    attribute: SpecItem.shape.attribute,
    category: SpecItem.shape.category,
    serves: Refs.optional(),
    topic: SpecItem.shape.topic,
    options: SpecItem.shape.options,
    consequences: SpecItem.shape.consequences,
  }),
  z.object({ op: z.literal('remove_item'), ref: Ref }),
  z.object({
    op: z.literal('set_scenario'),
    /** An existing scenario to update; omit to add one. */
    id: Ref.optional(),
    flow: Ref,
    title: z.string().trim().min(1).max(100),
    steps: z.array(z.object({ from: Ref, to: Ref, what: z.string().trim().min(1).max(100) })).min(1).max(20),
  }),
  z.object({ op: z.literal('remove_scenario'), ref: Ref }),
  z.object({ op: z.literal('add_section'), title: z.string().trim().min(1).max(80) }),
  z.object({ op: z.literal('rename_section'), ref: z.string().trim().min(1).max(64), title: z.string().trim().min(1).max(80) }),
  z.object({ op: z.literal('remove_section'), ref: z.string().trim().min(1).max(64) }),
  z.object({ op: z.literal('approve_stage'), stage: StageId, by: z.string().trim().min(1).max(80) }),
  z.object({ op: z.literal('reopen_stage'), stage: StageId }),
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

  if (body.serves) {
    const missing = body.serves.find((ref) => !board.spec.items.some((i) => i.id === ref));
    if (missing) return fail(`"${missing}" is not an item in the stage documents. A building block serves items such as flow-1, system-2 or oversight-1.`);
    refs.serves = [...new Set(body.serves)];
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

/** The sections of the current stage's document: arc42 sections, then the ones the user added. */
function sectionOf(board: Board, id: string): { stage: string; custom: boolean } | null {
  const def = sectionDef(id);
  if (def) return { stage: def.stage, custom: false };
  const custom = board.spec.sections.find((s) => s.id === id);
  return custom ? { stage: custom.stage, custom: true } : null;
}

const frozen = (board: Board, stage: string) =>
  stage !== board.stage.current ? `That section belongs to ${stageOf(stage as never).title.toLowerCase()}, which is ${stageOf(stage as never).n < stageOf(board.stage.current).n ? 'approved: the user can reopen it in the app' : 'not started yet'}.` : null;

function recordItem(board: Board, body: Extract<ChangeBody, { op: 'record_item' }>, actor: Actor, basis: Basis | undefined): ApplyResult {
  const items = board.spec.items;
  const existing = body.id ? items.find((i) => i.id === body.id) : undefined;
  if (body.id && !existing) return fail(`Item "${body.id}" is not in the document.`);
  const section = sectionOf(board, body.section);
  if (!section) return fail(`There is no section "${body.section}" in the document.`);
  const locked = frozen(board, section.stage);
  if (locked) return fail(locked);

  const def = sectionDef(body.section);
  const type = section.custom ? (body.type === 'note' ? { id: 'note', named: false } : undefined) : def!.types.find((t) => t.id === body.type);
  if (!type) {
    return fail(`Section ${body.section} takes ${section.custom ? 'notes' : def!.types.map((t) => `${t.id} (${t.label.toLowerCase()})`).join(', ')}.`);
  }
  const name = body.name ?? existing?.name;
  if (type.named && !name) return fail(`A ${def!.types.find((t) => t.id === body.type)!.label.toLowerCase()} needs a short name, e.g. a role or a system.`);
  const attribute = body.attribute ?? existing?.attribute;
  if (body.type === 'quality' && !attribute) return fail(`A quality goal names its quality attribute: ${Object.keys(QUALITY_ATTRIBUTES).join(', ')}.`);
  const category = body.category ?? existing?.category;
  if (body.type === 'constraint' && !category) return fail(`A constraint names its category: ${Object.keys(CONSTRAINT_CATEGORIES).join(', ')}.`);

  const serves = body.serves ?? existing?.serves;
  if (serves) {
    const missing = serves.find((ref) => !items.some((i) => i.id === ref));
    if (missing) return fail(`"${missing}" is not an item in the stage documents.`);
  }
  if (body.type === 'quality_approach' && !serves?.some((ref) => items.find((i) => i.id === ref)?.section === '1.2')) {
    return fail('Name the quality goal from 1.2 this approach meets, in serves (e.g. quality-1).');
  }
  const topic = body.topic ?? existing?.topic;
  if (body.type === 'decision' && !topic) return fail('A decision record names its topic: platform, complexity, pattern, hosting or other.');
  const options = body.options ?? existing?.options;
  if (body.type === 'decision' && options?.length && !options.some((o) => o.toLowerCase() === name?.toLowerCase())) {
    return fail(`A decision's name is the option chosen, and it is one of the options weighed (${options.join(', ')}).`);
  }

  // What the coach records quotes its source; what the user types in the app is the user's own.
  let source: SpecItem['source'];
  if (basis) {
    if (basis.source === 'document' && !basis.document) return fail('Name the document the quote comes from.');
    source = { kind: basis.source, ...(basis.document ? { document: basis.document } : {}), quote: basis.quote };
  } else if (actor === 'user') {
    source = { kind: 'typed' };
  } else {
    return fail('An item needs its source: the brief, the user\'s words or a pasted document, quoted.');
  }

  let id = existing?.id;
  if (!id) {
    const dup = items.find((i) => i.section === body.section && i.type === body.type && i.text.toLowerCase() === body.text.toLowerCase());
    id = dup?.id;
  }
  if (!id) {
    // ids are slugs: in_scope items become in-scope-1, in-scope-2, ...
    const prefix = body.type.replace(/_/g, '-');
    let n = items.filter((i) => i.type === body.type).length + 1;
    while (items.some((i) => i.id === `${prefix}-${n}`)) n++;
    id = `${prefix}-${n}`;
  }
  const item: SpecItem = {
    id,
    section: body.section,
    type: body.type,
    text: body.text,
    ...(type.named && name ? { name } : {}),
    ...(body.type === 'quality' && attribute ? { attribute } : {}),
    ...(body.type === 'constraint' && category ? { category } : {}),
    ...(serves?.length ? { serves: [...new Set(serves)] } : {}),
    ...(body.type === 'decision' && topic ? { topic } : {}),
    ...(body.type === 'decision' && (body.options ?? existing?.options) ? { options: body.options ?? existing?.options } : {}),
    ...(body.type === 'decision' && (body.consequences ?? existing?.consequences) ? { consequences: body.consequences ?? existing?.consequences } : {}),
    source,
  };
  const known = items.some((i) => i.id === id);
  return {
    ok: true,
    board: { ...board, spec: { ...board.spec, items: known ? items.map((i) => (i.id === id ? item : i)) : [...items, item] } },
    summary: `${known ? 'Updated' : 'Recorded'} ${id} in section ${body.section}`,
    warnings: [],
  };
}

function editSections(board: Board, body: Extract<ChangeBody, { op: 'add_section' | 'rename_section' | 'remove_section' }>): ApplyResult {
  const sections = board.spec.sections;
  if (body.op === 'add_section') {
    let id = `x-${slug(body.title)}`.slice(0, 62);
    for (let n = 2; sections.some((s) => s.id === id); n++) id = `x-${slug(body.title)}-${n}`.slice(0, 62);
    return {
      ok: true,
      board: { ...board, spec: { ...board.spec, sections: [...sections, { id, stage: board.stage.current, title: body.title }] } },
      summary: `Added section "${body.title}"`,
      warnings: [],
    };
  }
  const target = sections.find((s) => s.id === body.ref);
  if (!target) return fail(sectionDef(body.ref) ? 'The arc42 sections are part of the template; add a section of your own instead.' : `There is no section "${body.ref}".`);
  const locked = frozen(board, target.stage);
  if (locked) return fail(locked);
  if (body.op === 'rename_section') {
    return { ok: true, board: { ...board, spec: { ...board.spec, sections: sections.map((s) => (s.id === target.id ? { ...s, title: body.title } : s)) } }, summary: `Renamed section to "${body.title}"`, warnings: [] };
  }
  return {
    ok: true,
    board: { ...board, spec: { ...board.spec, items: board.spec.items.filter((i) => i.section !== target.id), sections: sections.filter((s) => s.id !== target.id) } },
    summary: `Removed section "${target.title}"`,
    warnings: [],
  };
}

/** A runtime scenario: one user flow as numbered steps between people, building blocks and external systems. */
function setScenario(board: Board, body: Extract<ChangeBody, { op: 'set_scenario' }>, actor: Actor, basis: Basis | undefined): ApplyResult {
  const flow = board.spec.items.find((i) => i.id === body.flow);
  if (!flow || flow.type !== 'flow') return fail(`"${body.flow}" is not a user flow from 1.1. A runtime scenario realises one, e.g. flow-1.`);
  const participant = (ref: string): string | null => {
    const item = board.spec.items.find((i) => (i.id === ref || i.name?.toLowerCase() === ref.toLowerCase()) && i.section === '3.2');
    if (item) return item.id;
    return findComponent(board, ref)?.id ?? findTeam(board, ref)?.id ?? null;
  };
  const steps = [];
  for (const [n, st] of body.steps.entries()) {
    const from = participant(st.from);
    const to = participant(st.to);
    if (!from || !to) {
      return fail(`Step ${n + 1}: "${!from ? st.from : st.to}" is neither a person or system from 3.2 nor a building block on the board.`);
    }
    steps.push({ from, to, what: st.what });
  }
  let source: SpecItem['source'];
  if (basis) source = { kind: basis.source, ...(basis.document ? { document: basis.document } : {}), quote: basis.quote };
  else if (actor === 'user') source = { kind: 'typed' };
  else return fail('A runtime scenario needs its source: the flow it realises was stated by the user; quote them.');
  const scenarios = board.spec.scenarios;
  const existing = body.id ? scenarios.find((x) => x.id === body.id) : scenarios.find((x) => x.flow === body.flow && x.title.toLowerCase() === body.title.toLowerCase());
  if (body.id && !existing) return fail(`Scenario "${body.id}" does not exist.`);
  let id = existing?.id;
  for (let n = scenarios.length + 1; !id; n++) if (!scenarios.some((x) => x.id === `scenario-${n}`)) id = `scenario-${n}`;
  const scenario = { id, flow: body.flow, title: body.title, steps, source };
  return {
    ok: true,
    board: { ...board, spec: { ...board.spec, scenarios: existing ? scenarios.map((x) => (x.id === id ? scenario : x)) : [...scenarios, scenario] } },
    summary: `${existing ? 'Updated' : 'Added'} runtime scenario ${id} for ${body.flow}`,
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

  // Stages: approvals come from a person, and each stage accepts only its own changes.
  if ((body.op === 'approve_stage' || body.op === 'reopen_stage') && checked.data.actor !== 'user') {
    return fail('Only a person can approve or reopen a stage, in the app. Tell the user what this stage produced and ask them to approve it.');
  }
  if ((body.op === 'add_section' || body.op === 'rename_section' || body.op === 'remove_section') && checked.data.actor !== 'user') {
    return fail('Sections are the arc42 template plus the ones the user adds in the app. Record items in the template sections.');
  }
  const stageRefusal = outOfStage(board, body.op);
  if (stageRefusal) return fail(stageRefusal);

  // Nothing is designed before the goal is known.
  const needsGoal = !['set_brief', 'set_title', 'clear', 'remove_component', 'remove_team', 'disconnect', 'record_item', 'remove_item', 'add_section', 'rename_section', 'remove_section', 'approve_stage', 'reopen_stage'].includes(body.op);
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
    case 'approve_stage': {
      if (body.stage !== board.stage.current) return fail(`The current stage is ${stageOf(board.stage.current).title.toLowerCase()}; only it can be approved.`);
      const g = gate(board, body.stage);
      if (!g.ready) return fail(`${stageOf(body.stage).title} is not ready for approval. Still missing: ${g.missing.join(', ')}.`);
      const next = STAGES[stageOf(body.stage).n]?.id ?? body.stage;
      result = {
        ok: true,
        board: { ...board, stage: { current: next, approvals: [...board.stage.approvals, { stage: body.stage, by: body.by, at: checked.data.at }] } },
        summary: `${stageOf(body.stage).title} approved by ${body.by}`,
        warnings: [],
      };
      break;
    }
    case 'reopen_stage': {
      const target = stageOf(body.stage);
      if (target.n > stageOf(board.stage.current).n) return fail(`${target.title} has not started yet.`);
      const approvals = board.stage.approvals.filter((a) => stageOf(a.stage).n < target.n);
      result = { ok: true, board: { ...board, stage: { current: body.stage, approvals } }, summary: `Reopened ${target.title.toLowerCase()}`, warnings: [] };
      break;
    }
    case 'record_item':
      result = recordItem(board, body, checked.data.actor, checked.data.basis);
      break;
    case 'remove_item': {
      const target = board.spec.items.find((i) => i.id === body.ref);
      const where = target ? sectionOf(board, target.section) : null;
      const locked = where ? frozen(board, where.stage) : null;
      result = !target
        ? fail(`Item "${body.ref}" is not in the document.`)
        : locked
          ? fail(locked)
          : { ok: true, board: { ...board, spec: { ...board.spec, items: board.spec.items.filter((i) => i.id !== target.id) } }, summary: `Removed ${target.id}`, warnings: [] };
      break;
    }
    case 'add_section':
    case 'rename_section':
    case 'remove_section':
      result = editSections(board, body);
      break;
    case 'set_scenario':
      result = setScenario(board, body, checked.data.actor, checked.data.basis);
      break;
    case 'remove_scenario': {
      const target = board.spec.scenarios.find((x) => x.id === body.ref);
      result = target
        ? { ok: true, board: { ...board, spec: { ...board.spec, scenarios: board.spec.scenarios.filter((x) => x.id !== target.id) } }, summary: `Removed ${target.id}`, warnings: [] }
        : fail(`Scenario "${body.ref}" does not exist.`);
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
