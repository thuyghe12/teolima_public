/**
 * The building blocks the board may contain: Microsoft components, each with
 * its official name, the Microsoft product it belongs to, the visual family it
 * is drawn in, what it compiles to, its release status, and the page its name
 * and meaning were checked against.
 *
 * The board model's enums (component kinds, tool types, knowledge sources,
 * memory stores) map onto these entries one to one, and a test fails if a
 * value has no block. So the coach can only place what is in this list.
 *
 * Add an entry only together with its compile meaning and source. See
 * docs/BLOCKS.md.
 */
import type { Component } from '../board/schema';

/** How a block is drawn. Different kinds of thing look different on the board. */
export type Family = 'agent' | 'capability' | 'governance' | 'io';

export type Status = 'ga' | 'preview' | 'design_only';

export interface Block {
  id: string;
  /** Official name, as Microsoft writes it. */
  name: string;
  /** The Microsoft product or service it belongs to. */
  product: string;
  family: Family;
  status: Status;
  /** What the compiler emits for it (docs/BOARD_MODEL.md). */
  compiles: string;
  /** Where the name and meaning were checked. */
  source: string;
  checked: string;
  /** Icon from the official Azure architecture icon set, once added (docs/BLOCKS.md). */
  icon?: string;
}

const CHECKED = '2026-11-18';
const TOOL_CATALOG = 'https://learn.microsoft.com/azure/foundry/agents/concepts/tool-catalog';

export const BLOCKS: Block[] = [
  // Agents
  {
    id: 'foundry_agent',
    name: 'Agent',
    product: 'Foundry Agent Service',
    family: 'agent',
    status: 'ga',
    compiles: 'A declarative agent (kind: Prompt) and an azure.ai.agent service in azure.yaml',
    source: 'https://learn.microsoft.com/agent-framework/agents/declarative',
    checked: CHECKED,
  },

  // Agent capabilities: tools, from the Foundry tool catalog
  { id: 'function_tool', name: 'Function calling', product: 'Foundry Agent Service', family: 'capability', status: 'ga', compiles: 'A function tool on the agent; the application runs the function', source: TOOL_CATALOG, checked: CHECKED },
  { id: 'mcp_tool', name: 'Model Context Protocol (MCP)', product: 'Foundry Agent Service', family: 'capability', status: 'ga', compiles: 'An MCP tool with server label and URL', source: TOOL_CATALOG, checked: CHECKED },
  { id: 'openapi_tool', name: 'OpenAPI 3.0 specified tool', product: 'Foundry Agent Service', family: 'capability', status: 'ga', compiles: 'An OpenAPI 3.0 specified tool', source: TOOL_CATALOG, checked: CHECKED },
  { id: 'web_search_tool', name: 'Web search', product: 'Foundry Agent Service', family: 'capability', status: 'ga', compiles: 'The web search tool', source: TOOL_CATALOG, checked: CHECKED },
  { id: 'code_interpreter_tool', name: 'Code Interpreter', product: 'Foundry Agent Service', family: 'capability', status: 'ga', compiles: 'The code interpreter tool', source: TOOL_CATALOG, checked: CHECKED },
  { id: 'file_search_tool', name: 'File Search', product: 'Foundry Agent Service', family: 'capability', status: 'ga', compiles: 'The file search tool with a vector store', source: TOOL_CATALOG, checked: CHECKED },
  { id: 'a2a_tool', name: 'Agent-to-Agent (A2A)', product: 'Foundry Agent Service', family: 'capability', status: 'preview', compiles: 'An A2A tool pointing at an A2A-compatible endpoint', source: TOOL_CATALOG, checked: CHECKED },

  // Agent capabilities: knowledge
  { id: 'azure_ai_search', name: 'Azure AI Search', product: 'Azure AI Search', family: 'capability', status: 'ga', compiles: 'The Azure AI Search tool, a search service and its project connection in Bicep', source: TOOL_CATALOG, checked: CHECKED },

  // Agent capabilities: long-term memory
  { id: 'foundry_memory', name: 'Memory', product: 'Foundry Agent Service', family: 'capability', status: 'preview', compiles: 'A Foundry Agent Service memory store', source: 'https://learn.microsoft.com/azure/ai-foundry/agents/concepts/agent-memory', checked: CHECKED },
  { id: 'cosmos_db_memory', name: 'Azure Cosmos DB', product: 'Azure Cosmos DB', family: 'capability', status: 'ga', compiles: 'An Agent Framework context provider over Azure Cosmos DB, and the Cosmos DB account in Bicep', source: 'https://devblogs.microsoft.com/cosmosdb/native-agent-memory-for-microsoft-agent-framework-powered-by-azure-cosmos-db/', checked: CHECKED },

  // Governance
  { id: 'foundry_guardrail', name: 'Guardrail', product: 'Microsoft Foundry', family: 'governance', status: 'ga', compiles: 'A Foundry guardrail (an RAI policy in Azure Resource Manager)', source: 'https://learn.microsoft.com/azure/foundry/guardrails/how-to-create-guardrails', checked: CHECKED },
  { id: 'tool_approval', name: 'Tool approval', product: 'Microsoft Agent Framework', family: 'governance', status: 'ga', compiles: 'Tool approval on the gated tool, or a human-in-the-loop step before the gated agent', source: 'https://learn.microsoft.com/agent-framework/agents/providers/microsoft-foundry', checked: CHECKED },

  // Where work enters and leaves: described on the board, wired up by the host
  { id: 'trigger', name: 'Trigger', product: 'Teolima', family: 'io', status: 'design_only', compiles: 'The agent or workflow endpoint for chat and API; the host for schedules and events', source: 'docs/BOARD_MODEL.md', checked: CHECKED },
  { id: 'output', name: 'Output', product: 'Teolima', family: 'io', status: 'design_only', compiles: 'Where results go; wired up by the host application', source: 'docs/BOARD_MODEL.md', checked: CHECKED },
];

const byId = new Map(BLOCKS.map((b) => [b.id, b]));

export function block(id: string): Block {
  const b = byId.get(id);
  if (!b) throw new Error(`No building block "${id}"`);
  return b;
}

const TOOL_BLOCK: Record<string, string> = {
  function: 'function_tool',
  mcp: 'mcp_tool',
  openapi: 'openapi_tool',
  web_search: 'web_search_tool',
  code_interpreter: 'code_interpreter_tool',
  file_search: 'file_search_tool',
  a2a: 'a2a_tool',
};
const KNOWLEDGE_BLOCK: Record<string, string> = { ai_search: 'azure_ai_search', file_search: 'file_search_tool', web: 'web_search_tool' };
const MEMORY_BLOCK: Record<string, string> = { foundry_memory: 'foundry_memory', cosmos_db: 'cosmos_db_memory' };

/** The building block a board component is an instance of. */
export function blockFor(c: Component): Block {
  switch (c.kind) {
    case 'agent':
      return block('foundry_agent');
    case 'tool':
      return block(TOOL_BLOCK[c.toolType]);
    case 'knowledge':
      return block(KNOWLEDGE_BLOCK[c.source]);
    case 'memory':
      return block(MEMORY_BLOCK[c.store]);
    case 'guardrail':
      return block('foundry_guardrail');
    case 'approval':
      return block('tool_approval');
    case 'trigger':
      return block('trigger');
    case 'output':
      return block('output');
  }
}

/** Exposed for the exhaustiveness test. */
export const ENUM_BLOCKS = { tool: TOOL_BLOCK, knowledge: KNOWLEDGE_BLOCK, memory: MEMORY_BLOCK };
