/**
 * The Azure resources a design needs, derived from the board, the decisions
 * of solution design and the settings of technical design. It is the C4
 * deployment view of stage 3 and the resource list the compiler generates
 * Bicep for, so the two cannot disagree.
 *
 * Every resource names the Microsoft source that puts it there, and the
 * building blocks it runs or serves. Service names are the ones the baseline
 * Foundry architecture uses.
 */
import { DEPLOYMENT_SETTINGS, hostingOf, type DeploymentSetting, type Hosting } from './arc42';
import type { Board } from './schema';

const BASELINE = 'https://learn.microsoft.com/en-us/azure/architecture/ai-ml/architecture/baseline-microsoft-foundry-chat';
const WORKFLOW = 'https://learn.microsoft.com/en-us/azure/architecture/ai-ml/idea/multiple-agent-workflow-automation';

/** Where a resource sits in the deployment view, left to right, with operations underneath. */
export type ResourceGroup = 'edge' | 'runtime' | 'ai' | 'data' | 'network' | 'operations';
export const GROUPS: Record<ResourceGroup, string> = {
  edge: 'Entry',
  runtime: 'Agent runtime',
  ai: 'Models',
  data: 'Data',
  network: 'Network',
  operations: 'Operations',
};

export interface Resource {
  id: string;
  /** The Azure service, by its official name. */
  service: string;
  /** What it does in this system. */
  purpose: string;
  group: ResourceGroup;
  /** Board component ids it runs or stores for. */
  serves: string[];
  /** Reached through a private endpoint in the virtual network. */
  private: boolean;
  /** Provided by an existing platform landing zone instead of deployed with the system. */
  reused: boolean;
  /** The Microsoft source that puts it in the design. */
  source: string;
}

export interface ResourcePlan {
  resources: Resource[];
  /** Private networking: a virtual network, private endpoints, private DNS and egress control. */
  isolated: boolean;
  hosting: Hosting;
  /** What the plan could not decide, in words: technical design must settle it. */
  open: string[];
  /** What the compile wizard asks, because no stage decides it (an agent's model). */
  ask: string[];
}

/** A technical design setting, by category: the option recorded as the item's name. */
export function setting(board: Pick<Board, 'spec'>, category: DeploymentSetting): string | undefined {
  return board.spec.items.find((i) => i.section === '7' && i.type === 'setting' && i.category === category)?.name;
}

export function resourcePlan(board: Pick<Board, 'spec' | 'components'>): ResourcePlan {
  const open: string[] = [];
  const ask: string[] = [];
  const hostingName = board.spec.items.find((i) => i.type === 'decision' && i.topic === 'hosting')?.name;
  const hosting = hostingOf(hostingName) ?? 'Prompt agents';
  if (!hostingOf(hostingName)) open.push('the hosting decision (prompt agents assumed)');
  const isolation = setting(board, 'network_isolation');
  const isolated = isolation ? isolation.toLowerCase() === DEPLOYMENT_SETTINGS.network_isolation.values[0].toLowerCase() : true;
  if (!isolation) open.push('network isolation (private networking assumed)');
  const reuse = setting(board, 'landing_zone')?.toLowerCase() === DEPLOYMENT_SETTINGS.landing_zone.values[1].toLowerCase();

  const of = (kind: string) => board.components.filter((c) => c.kind === kind);
  const ids = (kind: string) => of(kind).map((c) => c.id);
  const agents = board.components.flatMap((c) => (c.kind === 'agent' ? [c] : []));
  const out: Resource[] = [];
  const add = (r: Omit<Resource, 'private' | 'reused'> & { private?: boolean; reused?: boolean }) => out.push({ private: false, reused: false, ...r });

  // Entry: a chat or API front end runs on App Service; with private networking, behind Application Gateway and its firewall.
  const web = board.components.filter((c) => c.kind === 'trigger' && (c.source === 'chat' || c.source === 'api'));
  if (web.length) {
    if (isolated) {
      add({ id: 'app-gateway', service: 'Azure Application Gateway', purpose: 'Entry point with Web Application Firewall and TLS termination', group: 'edge', serves: web.map((c) => c.id), source: `${BASELINE}#components` });
      add({ id: 'key-vault', service: 'Azure Key Vault', purpose: 'TLS certificates for the gateway', group: 'edge', serves: web.map((c) => c.id), private: true, source: `${BASELINE}#components` });
    }
    add({ id: 'app-service', service: 'Azure App Service', purpose: 'Hosts the front end', group: 'edge', serves: web.map((c) => c.id), private: isolated, source: `${BASELINE}#components` });
  }
  for (const t of board.components.filter((c) => c.kind === 'trigger' && c.source !== 'chat' && c.source !== 'api')) {
    open.push(`where the ${t.kind === 'trigger' ? t.source : ''} trigger "${t.name}" runs`);
  }

  // Agent runtime, by the hosting decision.
  if (hosting === 'Self-hosted orchestration') {
    add({ id: 'container-apps', service: 'Azure Container Apps', purpose: 'Runs the agent orchestration code', group: 'runtime', serves: agents.map((a) => a.id), private: isolated, source: `${WORKFLOW}#components` });
    add({ id: 'container-registry', service: 'Azure Container Registry', purpose: 'Versioned images of the orchestration code', group: 'runtime', serves: agents.map((a) => a.id), private: isolated, source: `${WORKFLOW}#workflow` });
  } else {
    add({ id: 'agent-service', service: 'Foundry Agent Service', purpose: hosting === 'Hosted agents' ? 'Runs the hosted agents' : 'Runs the prompt agents', group: 'runtime', serves: agents.map((a) => a.id), private: isolated, source: `${BASELINE}#components` });
    if (hosting === 'Hosted agents') {
      add({ id: 'container-registry', service: 'Azure Container Registry', purpose: 'Images of the hosted agents', group: 'runtime', serves: agents.map((a) => a.id), private: isolated, source: `${BASELINE}#alternatives` });
    }
  }

  // Models: the Foundry resource and project, and one deployment per model the agents name.
  add({ id: 'foundry', service: 'Microsoft Foundry', purpose: 'The Foundry resource and project: models, connections, guardrails', group: 'ai', serves: [...agents.map((a) => a.id), ...ids('guardrail')], private: isolated, source: `${BASELINE}#components` });
  const models = [...new Set(agents.map((a) => a.model))];
  for (const m of models) {
    const users = agents.filter((a) => a.model === m).map((a) => a.id);
    add({ id: `model-${m || 'unset'}`, service: 'Model deployment', purpose: m || 'Model to choose', group: 'ai', serves: users, source: `${BASELINE}#model-and-tool-selection` });
    if (!m) ask.push('the model for ' + agents.filter((a) => !a.model).map((a) => `"${a.name}"`).join(', '));
  }

  // Data: the standard agent setup keeps agent state in the system's own subscription; the system's own stores beside it.
  if (hosting !== 'Self-hosted orchestration' && isolated) {
    add({ id: 'agent-state', service: 'Azure Cosmos DB for NoSQL', purpose: 'Agent state and conversations (standard agent setup)', group: 'data', serves: agents.map((a) => a.id), private: true, source: `${BASELINE}#components` });
    add({ id: 'agent-files', service: 'Azure Storage', purpose: 'Files uploaded in conversations (standard agent setup)', group: 'data', serves: agents.map((a) => a.id), private: true, source: `${BASELINE}#components` });
    add({ id: 'agent-search', service: 'Azure AI Search', purpose: 'Index of uploaded files (standard agent setup)', group: 'data', serves: agents.map((a) => a.id), private: true, source: `${BASELINE}#components` });
  }
  const search = board.components.filter((c) => c.kind === 'knowledge' && c.source === 'ai_search');
  if (search.length) add({ id: 'search', service: 'Azure AI Search', purpose: `Indexes: ${search.map((c) => c.name).join(', ')}`, group: 'data', serves: search.map((c) => c.id), private: isolated, source: `${BASELINE}#components` });
  const cosmos = board.components.filter((c) => c.kind === 'memory' && c.store === 'cosmos_db');
  if (cosmos.length) add({ id: 'memory', service: 'Azure Cosmos DB for NoSQL', purpose: `Memory: ${cosmos.map((c) => c.name).join(', ')}`, group: 'data', serves: cosmos.map((c) => c.id), private: isolated, source: `${WORKFLOW}#components` });

  // Operations: diagnostics from every service to the workload's Log Analytics workspace.
  add({ id: 'app-insights', service: 'Application Insights', purpose: 'Traces and telemetry of the agents', group: 'operations', serves: agents.map((a) => a.id), source: `${BASELINE}#operational-excellence` });
  add({ id: 'log-analytics', service: 'Log Analytics workspace', purpose: 'Diagnostics from every service', group: 'operations', serves: [], source: `${BASELINE}#operational-excellence` });

  // Network: with private networking, reused from the platform landing zone when there is one.
  if (isolated) {
    const net = (id: string, service: string, purpose: string) => add({ id, service, purpose, group: 'network', serves: [], reused: reuse, source: `${BASELINE}#components` });
    net('vnet', 'Azure Virtual Network', 'Isolates every component');
    net('private-dns', 'Azure DNS', 'Private DNS zones for the private endpoints');
    net('firewall', 'Azure Firewall', 'Controls all outbound traffic');
  }
  return { resources: out, isolated, hosting, open, ask };
}
