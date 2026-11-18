/**
 * The coach's tools for building the board.
 *
 * Each tool maps onto one change in shared/board/changes.ts. The model never
 * draws shapes or chooses positions: it edits the board model, the change log
 * validates every edit, and the layout is computed from the result.
 */
import { Type, type FunctionDeclaration } from '@google/genai';
import { emptyBoard, type Board } from '../shared/board/schema';
import { applyChange, type Actor, type ApplyResult, type ChangeBody, type Change } from '../shared/board/changes';

const reason = { type: Type.STRING, description: 'Why, in one short sentence. Stored with the change.' };
const names = (description: string) => ({ type: Type.ARRAY, items: { type: Type.STRING }, description });

export const boardToolDeclarations: FunctionDeclaration[] = [
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
        kind: { type: Type.STRING, enum: ['agent', 'tool', 'knowledge', 'guardrail', 'approval', 'trigger', 'output'] },
        name: { type: Type.STRING, description: 'Short, unique name, e.g. "Refund Agent".' },
        description: { type: Type.STRING, description: 'One line on what it is for.' },
        instructions: { type: Type.STRING, description: 'Agent only: what the agent is told to do.' },
        tools: names('Agent only: names of tools on the board that this agent uses.'),
        knowledge: names('Agent only: names of knowledge sources on the board this agent grounds in.'),
        tool_type: { type: Type.STRING, enum: ['function', 'mcp', 'openapi', 'web_search', 'code_interpreter', 'file_search'], description: 'Tool only.' },
        endpoint: { type: Type.STRING, description: 'MCP or OpenAPI tool only, if known.' },
        source: { type: Type.STRING, description: 'Knowledge: ai_search, file_search or web. Trigger: chat, api, schedule or event.' },
        controls: { type: Type.ARRAY, items: { type: Type.STRING, enum: ['prompt_shields', 'harm_filters', 'groundedness', 'protected_material'] }, description: 'Guardrail only.' },
        applies_to: names('Guardrail only: agent names it covers. Leave empty to cover every agent.'),
        gates: { type: Type.STRING, description: 'Approval only: name of the tool or agent that needs a person to approve.' },
        condition: { type: Type.STRING, description: 'Approval only: when approval is needed, e.g. "refunds over 100 EUR".' },
        destination: { type: Type.STRING, enum: ['chat', 'api', 'email', 'teams', 'storage'], description: 'Output only.' },
        reason,
      },
      required: ['kind', 'name'],
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
      },
      required: ['name', 'pattern', 'members'],
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
      properties: { from: { type: Type.STRING }, to: { type: Type.STRING }, label: { type: Type.STRING, description: 'What flows, in a few words.' }, reason },
      required: ['from', 'to'],
    },
  },
  {
    name: 'disconnect',
    description: 'Remove a connection.',
    parameters: { type: Type.OBJECT, properties: { from: { type: Type.STRING }, to: { type: Type.STRING }, reason }, required: ['from', 'to'] },
  },
  {
    name: 'clear_board',
    description: 'Remove everything to start a new design. Only when the user asks for a fresh start.',
    parameters: { type: Type.OBJECT, properties: { reason }, required: [] },
  },
];

export const BOARD_TOOLS = new Set(boardToolDeclarations.map((d) => d.name as string));

const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** Maps a tool call onto a change body. The change log does the validation. */
export function toChangeBody(name: string, args: Record<string, unknown> = {}): ChangeBody | null {
  switch (name) {
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
    case 'clear_board':
      return { op: 'clear' };
    default:
      return null;
  }
}

/** One board per session, with its change log. */
export class BoardSession {
  board: Board = emptyBoard();
  readonly changes: Change[] = [];

  apply(body: ChangeBody, actor: Actor, why: string): ApplyResult {
    const change: Change = { body, actor, reason: why.trim() || 'No reason given', at: new Date().toISOString() };
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
    return {
      title: this.board.title,
      components: this.board.components.map((c) => `${c.name} (${c.kind})`),
      teams: this.board.teams.map((t) => `${t.name}: ${t.pattern} [${t.members.map(name).join(', ')}]`),
      connections: this.board.connections.map((c) => `${name(c.from)} -> ${name(c.to)}${c.label ? ` (${c.label})` : ''}`),
    };
  }
}
