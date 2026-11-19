/**
 * The AI Landing Zone foundation every compiled project is built on: the
 * vendored Bicep (vendor/ai-landing-zone), unchanged, and its parameters file
 * with the design's choices as defaults. Each default keeps the landing
 * zone's own `${VARIABLE=default}` form, so any value can still be changed
 * per environment with `azd env set`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ResourcePlan } from '../../shared/board/deployment';
import type { Board } from '../../shared/board/schema';
import { slug } from '../../shared/board/schema';
import type { CompileAnswers } from '../../shared/compile/wizard';
import { modelsOf, resolved } from '../../shared/compile/wizard';
import { units } from './agents';

export const LANDING_ZONE_DIR = join(process.cwd(), 'vendor', 'ai-landing-zone');
export const LANDING_ZONE = {
  repo: 'https://github.com/Azure/bicep-ptn-aiml-landing-zone',
  tag: 'v2.7.3',
  commit: '97e2375b89dcda4900d75aac9e7ffb7b20cce165',
} as const;

/** Every file of the foundation, by path relative to it. */
export function landingZoneFiles(dir = LANDING_ZONE_DIR): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.set(relative(dir, p).split('\\').join('/'), readFileSync(p, 'utf8'));
    }
  };
  walk(dir);
  return out;
}

/** The parameters main.bicep declares, with their types: what a parameters file may set. */
export function declaredParameters(mainBicep: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of mainBicep.matchAll(/^param\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_.]+(?:\[\])?\??)/gm)) out.set(m[1], m[2]);
  return out;
}

/** An azd environment reference with the design's value as its default. */
const env = (name: string, value: string | boolean) => `\${${name}=${value}}`;

export interface ParameterChange {
  name: string;
  value: unknown;
  /** Why the design sets it, in words. */
  because: string;
  /** The specification items or decisions behind it. */
  serves: string[];
}

/**
 * The parameter values the design decides. Every name must be a parameter of
 * the vendored main.bicep; tests/compile.test.ts checks them all.
 */
export function parameterChanges(board: Board, plan: ResourcePlan, answers: CompileAnswers): ParameterChange[] {
  const r = resolved(board, answers);
  const setting = (category: string) => board.spec.items.find((i) => i.type === 'setting' && i.category === category)?.id ?? '';
  const hosting = board.spec.items.find((i) => i.type === 'decision' && i.topic === 'hosting')?.id ?? '';
  const has = (id: string) => plan.resources.some((r) => r.id === id);
  const agents = board.components.filter((c) => c.kind === 'agent');
  const out: ParameterChange[] = [
    { name: 'location', value: env('AZURE_LOCATION', r.region ?? ''), because: 'The region recorded in technical design', serves: [setting('region')] },
    { name: 'networkIsolation', value: env('NETWORK_ISOLATION', !!r.networkIsolation), because: r.networkIsolation ? 'Private networking' : 'Public endpoints', serves: [setting('network_isolation')] },
    { name: 'deploymentMode', value: env('DEPLOYMENT_MODE', r.landingZone ?? 'standalone'), because: r.landingZone === 'ailz-integrated' ? 'Spoke in an existing platform landing zone' : 'Standalone: the landing zone provides its own network', serves: [setting('landing_zone')] },
    { name: 'deploySearchService', value: env('DEPLOY_SEARCH_SERVICE', has('search') || has('agent-search')), because: 'Azure AI Search for knowledge or the standard agent setup', serves: plan.resources.filter((x) => x.service === 'Azure AI Search').flatMap((x) => x.serves) },
    { name: 'deployCosmosDb', value: env('DEPLOY_COSMOS_DB', has('memory') || has('agent-state')), because: 'Azure Cosmos DB for memory or agent state', serves: plan.resources.filter((x) => x.service === 'Azure Cosmos DB for NoSQL').flatMap((x) => x.serves) },
    { name: 'deployContainerApps', value: env('DEPLOY_CONTAINER_APPS', has('container-apps')), because: 'Container Apps only for self-hosted orchestration', serves: [hosting] },
    { name: 'deployContainerEnv', value: env('DEPLOY_CONTAINER_ENV', has('container-apps')), because: 'Container Apps only for self-hosted orchestration', serves: [hosting] },
    { name: 'deployGroundingWithBing', value: env('DEPLOY_GROUNDING_WITH_BING', board.components.some((c) => c.kind === 'knowledge' && c.source === 'web')), because: 'Grounding with Bing only for web knowledge', serves: board.components.filter((c) => c.kind === 'knowledge' && c.source === 'web').map((c) => c.id) },
    { name: 'prepareHostedAgent', value: env('PREPARE_HOSTED_AGENT', agents.length > 0), because: 'Exposes the Foundry project to the agent services in azure.yaml', serves: agents.map((a) => a.id) },
    {
      name: 'modelDeploymentList',
      value: modelsOf(board, answers).map((m) => {
        const a = answers.models?.[m];
        return {
          name: m,
          model: { format: 'OpenAI', name: m, version: a?.version ?? '' },
          sku: { name: a?.sku ?? 'GlobalStandard', capacity: a?.capacity ?? 0 },
          canonical_name: `${slug(m).replace(/-/g, '_').toUpperCase()}_DEPLOYMENT_NAME`,
          apiVersion: '2025-12-01-preview',
        };
      }),
      because: 'One deployment per model the agents use',
      serves: agents.map((a) => a.id),
    },
    {
      name: 'containerAppsList',
      value: has('container-apps')
        ? units(board).map((u) => ({
            name: null,
            external: false,
            target_port: 8088,
            service_name: u.service,
            profile_name: 'main',
            min_replicas: 1,
            max_replicas: 1,
            cpu: '1.0',
            memory: '2.0Gi',
            canonical_name: `${u.service.replace(/-/g, '_').toUpperCase()}_APP`,
            roles: ['CognitiveServicesUser', 'CognitiveServicesOpenAIUser', 'AcrPull', ...(has('memory') ? ['CosmosDBBuiltInDataContributor'] : []), ...(has('search') ? ['SearchIndexDataReader'] : [])],
          }))
        : [],
      because: 'One container app per agent service with self-hosted orchestration',
      serves: [hosting],
    },
    {
      name: 'databaseContainersList',
      value: board.components.flatMap((c) => (c.kind === 'memory' && c.store === 'cosmos_db' ? [{ name: slug(c.name), canonical_name: `${slug(c.name).replace(/-/g, '_').toUpperCase()}_CONTAINER`, partitionKey: c.scope === 'user' ? '/user_id' : '/session_id' }] : [])),
      because: 'One container per memory kept in Azure Cosmos DB',
      serves: board.components.filter((c) => c.kind === 'memory').map((c) => c.id),
    },
  ];
  if (r.landingZone === 'ailz-integrated') {
    out.push({ name: 'hubIntegrationHubVnetResourceId', value: env('HUB_VNET_RESOURCE_ID', answers.hubVnetResourceId ?? ''), because: 'The hub the spoke peers with', serves: [setting('landing_zone')] });
  }
  return out.map((c) => ({ ...c, serves: [...new Set(c.serves.filter(Boolean))] }));
}

/** The vendored parameters file with the design's values in place, in its own order and style. */
export function parametersFile(upstream: string, changes: ParameterChange[]): string {
  const doc = JSON.parse(upstream) as { parameters: Record<string, { value: unknown }> };
  for (const c of changes) doc.parameters[c.name] = { value: c.value };
  return `${JSON.stringify(doc, null, 2)}\n`;
}
