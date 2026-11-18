/**
 * The board: a typed document describing one multi-agent system.
 *
 * Every element maps one-to-one onto something the compiler emits for
 * Microsoft Agent Framework and Foundry (docs/adr/0001, docs/adr/0003):
 *
 * | Board                | Compiled to                                              |
 * |----------------------|----------------------------------------------------------|
 * | team + its pattern   | an Agent Framework orchestration (sequential, concurrent,|
 * |                      | handoff, group chat or magentic)                         |
 * | agent                | an Agent Framework agent, deployed as a hosted agent     |
 * | tool                 | a tool on the agent (function, MCP, OpenAPI, built-in)   |
 * | knowledge            | a grounding source, e.g. AI Search and its connection    |
 * | guardrail            | a Foundry guardrail on the agents it covers              |
 * | approval             | a human approval step before the gated tool or agent     |
 * | trigger / output     | where work enters the system and where results go        |
 *
 * Nothing in here holds coordinates: layout is computed from this document.
 */
import { z } from 'zod';

/** Stable ids: lowercase slugs derived from names, unique per board. */
export const Id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'ids are lowercase slugs');
export type Id = z.infer<typeof Id>;

const Name = z.string().trim().min(1).max(80);
const Text = z.string().trim().max(600);

/** The five built-in Agent Framework orchestration patterns. */
export const OrchestrationPattern = z.enum(['sequential', 'concurrent', 'handoff', 'group_chat', 'magentic']);
export type OrchestrationPattern = z.infer<typeof OrchestrationPattern>;

/** Foundry guardrail controls the board can ask for. */
export const GuardrailControl = z.enum(['prompt_shields', 'harm_filters', 'groundedness', 'protected_material']);
export type GuardrailControl = z.infer<typeof GuardrailControl>;

const Base = z.object({
  id: Id,
  name: Name,
  description: Text.default(''),
});

export const Trigger = Base.extend({
  kind: z.literal('trigger'),
  source: z.enum(['chat', 'api', 'schedule', 'event']).default('chat'),
});

export const Agent = Base.extend({
  kind: z.literal('agent'),
  /** What the agent is told to do. Becomes the agent's instructions. */
  instructions: Text.default(''),
  /** Model deployment name. Left empty, the compile wizard asks. */
  model: z.string().trim().max(80).default(''),
  tools: z.array(Id).max(20).default([]),
  knowledge: z.array(Id).max(10).default([]),
  /** Long-term memory the agent reads before and writes after each run. */
  memory: z.array(Id).max(5).default([]),
  /**
   * Where the conversation history lives: `service` keeps it in Foundry
   * (conversations); `client` keeps it in the application through an Agent
   * Framework chat history provider. See docs/BOARD_MODEL.md.
   */
  history: z.enum(['service', 'client']).default('service'),
});

export const Tool = Base.extend({
  kind: z.literal('tool'),
  toolType: z.enum(['function', 'mcp', 'openapi', 'web_search', 'code_interpreter', 'file_search', 'a2a']).default('function'),
  /** Endpoint for MCP and OpenAPI tools. Left empty, the compile wizard asks. */
  endpoint: z.string().trim().max(300).default(''),
});

export const Knowledge = Base.extend({
  kind: z.literal('knowledge'),
  source: z.enum(['ai_search', 'file_search', 'web']).default('ai_search'),
});

/**
 * Long-term memory, kept across conversations. `user` memory is scoped to one
 * user and recalled in their later conversations; `session` memory lasts for
 * one conversation. The store is Foundry Agent Service memory (preview) or
 * Azure Cosmos DB through an Agent Framework context provider.
 */
export const Memory = Base.extend({
  kind: z.literal('memory'),
  scope: z.enum(['user', 'session']).default('user'),
  store: z.enum(['foundry_memory', 'cosmos_db']).default('foundry_memory'),
});

export const Guardrail = Base.extend({
  kind: z.literal('guardrail'),
  /** Agents this guardrail covers. Empty means every agent on the board. */
  appliesTo: z.array(Id).max(40).default([]),
  controls: z.array(GuardrailControl).min(1).default(['prompt_shields', 'harm_filters']),
});

export const Approval = Base.extend({
  kind: z.literal('approval'),
  /** The tool or agent that cannot act until a person approves. */
  gates: Id,
  /** When approval is needed, in plain words, e.g. "refunds over 100 EUR". */
  condition: Text.default('always'),
});

export const Output = Base.extend({
  kind: z.literal('output'),
  destination: z.enum(['chat', 'api', 'email', 'teams', 'storage']).default('chat'),
});

export const Component = z.discriminatedUnion('kind', [Trigger, Agent, Tool, Knowledge, Memory, Guardrail, Approval, Output]);
export type Component = z.infer<typeof Component>;
export type ComponentKind = Component['kind'];
export const COMPONENT_KINDS = ['trigger', 'agent', 'tool', 'knowledge', 'memory', 'guardrail', 'approval', 'output'] as const;

export const Team = z.object({
  id: Id,
  name: Name,
  pattern: OrchestrationPattern,
  purpose: Text.default(''),
  /** Agent ids. For sequential, the order of this list is the order of execution. */
  members: z.array(Id).min(1).max(20),
  /** The managing agent for group_chat and magentic. */
  manager: Id.optional(),
  /** The first agent for handoff. */
  startAgent: Id.optional(),
});
export type Team = z.infer<typeof Team>;

export const Connection = z.object({
  id: Id,
  from: Id,
  to: Id,
  /** What flows along it, in a few words, e.g. "refund proposal". */
  label: z.string().trim().max(60).default(''),
});
export type Connection = z.infer<typeof Connection>;

/**
 * What the system must achieve, for whom, and within which limits. Nothing is
 * built before the goal is known: every element on the board must trace back
 * to the brief or to something the user said.
 */
export const Brief = z.object({
  goal: z.string().trim().max(600).default(''),
  audience: z.string().trim().max(200).default(''),
  constraints: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
});
export type Brief = z.infer<typeof Brief>;

/**
 * Single agent or several. Microsoft's guidance defaults to one agent with
 * tools and names the reasons that justify more (docs/DESIGN_STANDARD.md):
 * crossing a security or compliance boundary, several teams owning parts,
 * expected growth, or a single agent failing on prompt complexity or tool
 * overload. A second agent cannot be added without one of them.
 */
export const ShapeReason = z.enum([
  'security_or_compliance_boundary',
  'multiple_teams',
  'future_growth',
  'prompt_complexity',
  'tool_overload',
]);
export type ShapeReason = z.infer<typeof ShapeReason>;

export const Shape = z.object({
  kind: z.enum(['undecided', 'single', 'multi']).default('undecided'),
  reasons: z.array(ShapeReason).max(5).default([]),
});
export type Shape = z.infer<typeof Shape>;

export const Board = z.object({
  version: z.literal(1),
  title: z.string().trim().max(120).default(''),
  brief: Brief.default({ goal: '', audience: '', constraints: [] }),
  shape: Shape.default({ kind: 'undecided', reasons: [] }),
  components: z.array(Component).max(60),
  teams: z.array(Team).max(10),
  connections: z.array(Connection).max(150),
});
export type Board = z.infer<typeof Board>;

export const emptyBoard = (): Board => ({
  version: 1,
  title: '',
  brief: { goal: '', audience: '', constraints: [] },
  shape: { kind: 'undecided', reasons: [] },
  components: [],
  teams: [],
  connections: [],
});

/** Turns a display name into a stable id: "Refund Agent" -> "refund-agent". */
export function slug(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return s || 'item';
}
