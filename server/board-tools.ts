/**
 * The coach's tools for building the board.
 *
 * Each tool maps onto one change in shared/board/changes.ts. The model never
 * draws shapes or chooses positions: it edits the board model, the change log
 * validates every edit, and the layout is computed from the result.
 */
import { Type, type FunctionDeclaration } from '@google/genai';
import { Board, emptyBoard, ShapeReason } from '../shared/board/schema';
import { readiness } from '../shared/board/readiness';
import { applyChange, type Actor, type ApplyResult, type Basis, type ChangeBody, type Change } from '../shared/board/changes';

const reason = { type: Type.STRING, description: 'Why, in one short sentence. Stored with the change.' };
const names = (description: string) => ({ type: Type.ARRAY, items: { type: Type.STRING }, description });

/**
 * What a building change rests on. The server checks the quote against the
 * brief or against what the user actually said in this session
 * (server/guard/provenance.ts), so an element nobody asked for is refused.
 */
const basisSource = {
  type: Type.STRING,
  enum: ['brief', 'user'],
  description: 'brief = it follows from the saved brief; user = the user said it or explicitly agreed to it in this call.',
};
const basisQuote = {
  type: Type.STRING,
  description: 'The exact words from the brief or from the user that this rests on, a few words long. For an agreed proposal, the user\'s words agreeing to it, naming the thing.',
};
const basis = { basis_source: basisSource, basis_quote: basisQuote };

/** Tools that add to the design and so must name their basis. */
export const GROUNDED_TOOLS = new Set(['set_brief', 'set_shape', 'add_component', 'set_team', 'connect']);

export const boardToolDeclarations: FunctionDeclaration[] = [
  {
    name: 'set_brief',
    description:
      'Save what the system must achieve, who uses it and its constraints, exactly as the user stated them. Confirm it back to the user first. Nothing can be built until a goal is saved.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        goal: { type: Type.STRING, description: 'What the system must achieve, in the user\'s words.' },
        audience: { type: Type.STRING, description: 'Who uses it or who it serves.' },
        constraints: names('Limits the user stated: data that must stay in a region, actions that need a person, systems it may or may not touch.'),
        reason,
        basis_quote: { ...basisQuote, description: 'The user\'s own words stating the goal, a few words long.' },
      },
      required: ['goal', 'basis_quote'],
    },
  },
  {
    name: 'set_shape',
    description:
      'Decide, with the user, between one agent with tools (the default) and several agents. Several agents need at least one reason that applies: security_or_compliance_boundary (parts of the work need different access or rules), multiple_teams (different teams own parts), future_growth (the user expects the system to grow into more areas), prompt_complexity or tool_overload (one agent cannot handle it reliably). A second agent or a team is refused until this is set to multi.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        shape: { type: Type.STRING, enum: ['single', 'multi'] },
        reasons: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...ShapeReason.options] }, description: 'multi only: the reasons that apply.' },
        reason,
        ...basis,
      },
      required: ['shape', 'basis_source', 'basis_quote'],
    },
  },
  {
    name: 'set_title',
    description: 'Name the system being designed.',
    parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, reason }, required: ['title'] },
  },
  {
    name: 'add_component',
    description:
      'Add or update one element. Using a name that is already on the board updates that element. Add tools and knowledge before the agents that use them.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        kind: { type: Type.STRING, enum: ['agent', 'tool', 'knowledge', 'memory', 'guardrail', 'approval', 'trigger', 'output'] },
        name: { type: Type.STRING, description: 'Short, unique name, e.g. "Refund Agent".' },
        description: { type: Type.STRING, description: 'One line on what it is for.' },
        instructions: { type: Type.STRING, description: 'Agent only: what the agent is told to do.' },
        tools: names('Agent only: names of tools on the board that this agent uses.'),
        knowledge: names('Agent only: names of knowledge sources on the board this agent grounds in.'),
        memory: names('Agent only: names of memory elements on the board this agent reads and writes.'),
        history: { type: Type.STRING, enum: ['service', 'client'], description: 'Agent only: service = Foundry keeps the conversation history; client = the application keeps it. Ask the user if it matters for them (data location, retention).' },
        model: { type: Type.STRING, description: 'Agent only: the model deployment name, only if the user named one.' },
        scope: { type: Type.STRING, enum: ['user', 'session'], description: 'Memory only: user = remembered across that user\'s conversations; session = one conversation.' },
        store: { type: Type.STRING, enum: ['foundry_memory', 'cosmos_db'], description: 'Memory only: Foundry Agent Service memory or Azure Cosmos DB.' },
        tool_type: { type: Type.STRING, enum: ['function', 'mcp', 'openapi', 'web_search', 'code_interpreter', 'file_search', 'a2a'], description: 'Tool only. a2a = another agent reached through an Agent-to-agent endpoint.' },
        endpoint: { type: Type.STRING, description: 'MCP or OpenAPI tool only, if known.' },
        source: { type: Type.STRING, description: 'Knowledge: ai_search, file_search or web. Trigger: chat, api, schedule or event.' },
        controls: { type: Type.ARRAY, items: { type: Type.STRING, enum: ['prompt_shields', 'harm_filters', 'groundedness', 'protected_material'] }, description: 'Guardrail only.' },
        applies_to: names('Guardrail only: agent names it covers. Leave empty to cover every agent.'),
        gates: { type: Type.STRING, description: 'Approval only: name of the tool or agent that needs a person to approve.' },
        condition: { type: Type.STRING, description: 'Approval only: when approval is needed, e.g. "refunds over 100 EUR".' },
        destination: { type: Type.STRING, enum: ['chat', 'api', 'email', 'teams', 'storage'], description: 'Output only.' },
        reason,
        ...basis,
      },
      required: ['kind', 'name', 'basis_source', 'basis_quote'],
    },
  },
  {
    name: 'remove_component',
    description: 'Remove one element. Its connections, team membership and dependent approvals go with it.',
    parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, reason }, required: ['name'] },
  },
  {
    name: 'set_team',
    description:
      'Create or update a team: agents working together in one orchestration pattern. sequential = a fixed pipeline in member order; concurrent = in parallel, results combined; handoff = a start agent routes to specialists; group_chat = a manager runs a shared conversation; magentic = a manager plans and coordinates specialists for open-ended work.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        pattern: { type: Type.STRING, enum: ['sequential', 'concurrent', 'handoff', 'group_chat', 'magentic'] },
        members: names('Agent names, already on the board. For sequential, in execution order.'),
        manager: { type: Type.STRING, description: 'group_chat and magentic: the managing agent.' },
        start_agent: { type: Type.STRING, description: 'handoff: the agent that receives work first.' },
        purpose: { type: Type.STRING, description: 'One line on what the team achieves.' },
        reason,
        ...basis,
      },
      required: ['name', 'pattern', 'members', 'basis_source', 'basis_quote'],
    },
  },
  {
    name: 'remove_team',
    description: 'Remove a team. Its agents stay on the board without a team.',
    parameters: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, reason }, required: ['name'] },
  },
  {
    name: 'connect',
    description: 'Show what flows from one element or team to another, e.g. a trigger to the team that handles it.',
    parameters: {
      type: Type.OBJECT,
      properties: { from: { type: Type.STRING }, to: { type: Type.STRING }, label: { type: Type.STRING, description: 'What flows, in a few words.' }, reason, ...basis },
      required: ['from', 'to', 'basis_source', 'basis_quote'],
    },
  },
  {
    name: 'disconnect',
    description: 'Remove a connection.',
    parameters: { type: Type.OBJECT, properties: { from: { type: Type.STRING }, to: { type: Type.STRING }, reason }, required: ['from', 'to'] },
  },
];

export const BOARD_TOOLS = new Set(boardToolDeclarations.map((d) => d.name as string));

const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** The basis a tool call names; set_brief always rests on the user's words. */
export function basisFrom(name: string, args: Record<string, unknown> = {}): Basis | null {
  if (!GROUNDED_TOOLS.has(name)) return null;
  const source = name === 'set_brief' ? 'user' : args.basis_source;
  const quote = typeof args.basis_quote === 'string' ? args.basis_quote.trim().slice(0, 300) : '';
  if ((source !== 'brief' && source !== 'user') || !quote) return null;
  return { source, quote };
}

/** Maps a tool call onto a change body. The change log does the validation. */
export function toChangeBody(name: string, args: Record<string, unknown> = {}): ChangeBody | null {
  switch (name) {
    case 'set_brief':
      return { op: 'set_brief', goal: str(args.goal), audience: str(args.audience), constraints: list(args.constraints) };
    case 'set_shape':
      return { op: 'set_shape', shape: args.shape as never, reasons: list(args.reasons) as never };
    case 'set_title':
      return { op: 'set_title', title: String(args.title ?? '') };
    case 'add_component':
      return {
        op: 'upsert_component',
        kind: String(args.kind ?? '') as never,
        name: String(args.name ?? ''),
        description: str(args.description),
        instructions: str(args.instructions),
        tools: list(args.tools),
        knowledge: list(args.knowledge),
        memory: list(args.memory),
        history: str(args.history) as never,
        model: str(args.model),
        scope: str(args.scope),
        store: str(args.store),
        toolType: str(args.tool_type),
        endpoint: str(args.endpoint),
        source: str(args.source),
        controls: list(args.controls) as never,
        appliesTo: list(args.applies_to),
        gates: str(args.gates),
        condition: str(args.condition),
        destination: str(args.destination),
      } as ChangeBody;
    case 'remove_component':
      return { op: 'remove_component', ref: String(args.name ?? '') };
    case 'set_team':
      return {
        op: 'upsert_team',
        name: String(args.name ?? ''),
        pattern: args.pattern as never,
        members: list(args.members) ?? [],
        manager: str(args.manager),
        startAgent: str(args.start_agent),
        purpose: str(args.purpose),
      };
    case 'remove_team':
      return { op: 'remove_team', ref: String(args.name ?? '') };
    case 'connect':
      return { op: 'connect', from: String(args.from ?? ''), to: String(args.to ?? ''), label: str(args.label) };
    case 'disconnect':
      return { op: 'disconnect', from: String(args.from ?? ''), to: String(args.to ?? '') };
    default:
      return null;
  }
}

/** One board per session, with its change log. */
export class BoardSession {
  board: Board = emptyBoard();
  readonly changes: Change[] = [];

  /**
   * Restores a board the browser kept from an earlier connection, so ending a
   * call or reconnecting never wipes the design. Only an empty session accepts
   * one, and only a board that passes validation.
   */
  restore(candidate: unknown): boolean {
    if (this.board.components.length || this.board.teams.length) return false;
    const parsed = Board.safeParse(candidate);
    if (!parsed.success) return false;
    this.board = parsed.data;
    return true;
  }

  apply(body: ChangeBody, actor: Actor, why: string, basis?: Basis): ApplyResult {
    const change: Change = { body, actor, reason: why.trim() || 'No reason given', ...(basis ? { basis } : {}), at: new Date().toISOString() };
    const result = applyChange(this.board, change);
    if (result.ok) {
      this.board = result.board;
      this.changes.push(change);
    }
    return result;
  }

  /** A compact view of the board for the model's context. */
  summary() {
    const name = (id: string) =>
      this.board.components.find((c) => c.id === id)?.name ?? this.board.teams.find((t) => t.id === id)?.name ?? id;
    const ready = readiness(this.board);
    return {
      brief: this.board.brief,
      shape: this.board.shape,
      next_step: ready.next ? `${ready.next.title}: ${ready.next.detail}` : 'Every step of the design standard is done.',
      title: this.board.title,
      components: this.board.components.map((c) => `${c.name} (${c.kind})`),
      teams: this.board.teams.map((t) => `${t.name}: ${t.pattern} [${t.members.map(name).join(', ')}]`),
      connections: this.board.connections.map((c) => `${name(c.from)} -> ${name(c.to)}${c.label ? ` (${c.label})` : ''}`),
    };
  }
}
