/**
 * azure.yaml: the one file azd reads to provision and deploy the project. The
 * infrastructure is the AI Landing Zone Bicep in ./infra; the Foundry project
 * it creates is the azure.ai.project every agent service uses. Fields follow
 * the azd schema and the Foundry extension schemas vendored in
 * vendor/azd-schemas, and tests/compile.test.ts validates every compiled file
 * against them.
 */
import { hostingOf } from '../../shared/board/arc42';
import type { Board, Component } from '../../shared/board/schema';
import { slug } from '../../shared/board/schema';
import type { Unit } from './agents';

type Agent = Extract<Component, { kind: 'agent' }>;

export const AI_PROJECT = 'ai-project';
export const SCHEMA_LINE = '# yaml-language-server: $schema=https://raw.githubusercontent.com/Azure/azure-dev/main/schemas/v1.0/azure.yaml.json';

export interface EvalDataset {
  name: string;
  path: string;
  rows: Record<string, string>[];
}

export interface AzureYaml {
  doc: Record<string, unknown>;
  datasets: EvalDataset[];
  /** Environment values a person sets before deploying, with why. */
  settings: { name: string; why: string }[];
}

/** The unit a scenario runs in: the one holding most of the agents its steps name. */
export function unitOfScenario(units: Unit[], sc: Board['spec']['scenarios'][number]): Unit | undefined {
  const named = new Set(sc.steps.flatMap((s) => [s.from, s.to]));
  return [...units].sort((a, b) => score(b) - score(a))[0];
  function score(u: Unit) {
    return u.agents.filter((a) => named.has(a.id)).length + (u.team && named.has(u.team.id) ? u.agents.length : 0);
  }
}

export function azureYaml(board: Board, units: Unit[], model: (a: Agent) => string): AzureYaml {
  const hosting = hostingOf(board.spec.items.find((i) => i.type === 'decision' && i.topic === 'hosting')?.name) ?? 'Prompt agents';
  const services: Record<string, Record<string, unknown>> = {
    [AI_PROJECT]: { host: 'azure.ai.project', endpoint: '${AZURE_AI_PROJECT_ENDPOINT}' },
  };
  const settings: AzureYaml['settings'] = [];
  const env = (name: string, why: string) => {
    if (!settings.some((s) => s.name === name)) settings.push({ name, why });
    return `\${${name}}`;
  };

  // Knowledge in Azure AI Search, as a project connection the prompt agents use. Hosted
  // agents and self-hosted orchestration reach it from their own code (tools.py).
  const searchConn = (k: Component) => `${slug(k.name)}-search`;
  for (const k of hosting === 'Prompt agents' ? board.components.filter((c) => c.kind === 'knowledge' && c.source === 'ai_search') : []) {
    services[searchConn(k)] = {
      host: 'azure.ai.connection',
      uses: [AI_PROJECT],
      env: { AZURE_SEARCH_ENDPOINT: env('AZURE_SEARCH_ENDPOINT', 'The Azure AI Search endpoint the landing zone created') },
      category: 'CognitiveSearch',
      target: '${AZURE_SEARCH_ENDPOINT}',
      authType: 'AAD',
    };
  }

  if (hosting === 'Prompt agents') {
    for (const u of units) {
      const a = u.agents[0];
      const knowledge = a.knowledge.map((id) => board.components.find((c) => c.id === id)).filter((c): c is Component => c?.kind === 'knowledge' && c.source === 'ai_search');
      const toolConns = a.tools.map((id) => board.components.find((c) => c.id === id)).filter((c): c is Component => !!c);
      for (const t of toolConns) {
        const name = `${slug(t.name)}-tool`;
        const variable = `${slug(t.name).replace(/-/g, '_').toUpperCase()}_ENDPOINT`;
        services[name] = { host: 'azure.ai.connection', uses: [AI_PROJECT], env: { [variable]: env(variable, `The endpoint of ${t.name}`) }, category: 'RemoteTool', target: `\${${variable}}`, authType: 'ProjectManagedIdentity' };
      }
      services[u.service] = {
        host: 'azure.ai.agent',
        project: `./src/agents/${u.service}`,
        uses: [AI_PROJECT, ...knowledge.map(searchConn), ...toolConns.map((t) => `${slug(t.name)}-tool`)],
        kind: 'prompt',
        name: u.service,
        description: a.description || a.name,
        model: model(a),
        instructions: a.instructions || `You are ${a.name}. ${a.description}`.trim(),
        ...(knowledge.length ? { tools: knowledge.map((k) => ({ type: 'azure_ai_search', connection: searchConn(k) })) } : {}),
        ...(toolConns.length ? { connections: toolConns.map((t) => `${slug(t.name)}-tool`) } : {}),
      };
    }
  } else {
    for (const u of units) {
      const models = [...new Set(u.agents.map(model))];
      const modelEnv = models.length === 1 ? { AZURE_AI_MODEL_DEPLOYMENT_NAME: models[0] } : Object.fromEntries(models.map((m) => [`${slug(m).replace(/-/g, '_').toUpperCase()}_DEPLOYMENT_NAME`, m]));
      const description = u.team ? `${u.team.pattern.replace('_', ' ')} team: ${u.agents.map((a) => a.name).join(', ')}` : u.agents[0].description || u.name;
      services[u.service] =
        hosting === 'Hosted agents'
          ? {
              host: 'azure.ai.agent',
              project: `./src/agents/${u.service}`,
              language: 'docker',
              uses: [AI_PROJECT],
              kind: 'hosted',
              name: u.service,
              description,
              startupCommand: 'python main.py',
              // FOUNDRY_PROJECT_ENDPOINT is injected by the platform and must not be declared.
              env: { PYTHONNOUSERSITE: '1', ...modelEnv },
              protocols: [{ protocol: 'responses', version: '2.0.0' }],
              container: { resources: { cpu: '1.0', memory: '2Gi' } },
            }
          : {
              host: 'containerapp',
              project: `./src/agents/${u.service}`,
              language: 'docker',
              env: { FOUNDRY_PROJECT_ENDPOINT: '${AZURE_AI_PROJECT_ENDPOINT}', ...modelEnv },
            };
    }
  }

  // Scheduled triggers run as Foundry routines that invoke the agent they feed.
  for (const t of board.components.filter((c) => c.kind === 'trigger' && c.source === 'schedule')) {
    const target = board.connections.find((c) => c.from === t.id);
    const unit = units.find((u) => u.id === target?.to || u.agents.some((a) => a.id === target?.to)) ?? units[0];
    if (!unit) continue;
    const variable = `${slug(t.name).replace(/-/g, '_').toUpperCase()}_SCHEDULE`;
    services[slug(t.name)] = {
      host: 'azure.ai.routine',
      uses: [unit.service],
      env: { [variable]: env(variable, `When "${t.name}" runs, as a cron expression`) },
      description: t.description || t.name,
      triggers: { default: { type: 'schedule', cronExpression: `\${${variable}}` } },
      action: { type: 'invoke_agent_responses_api', agentName: unit.service },
    };
  }

  // Evaluations: one per runtime scenario, graded for task adherence and against every quality scenario.
  const datasets: EvalDataset[] = [];
  const judge = units.flatMap((u) => u.agents.map(model))[0];
  if (hosting !== 'Self-hosted orchestration' && board.spec.scenarios.length && judge) {
    const quality = board.spec.items.filter((i) => i.type === 'quality_scenario');
    const evals = board.spec.scenarios.map((sc) => {
      const flow = board.spec.items.find((i) => i.id === sc.flow);
      const name = `${slug(sc.title)}`;
      datasets.push({
        name,
        path: `evals/datasets/${name}.jsonl`,
        rows: [{ query: flow?.text ?? sc.title, expected: sc.steps.map((s, n) => `${n + 1}. ${s.what}`).join(' ') }],
      });
      const unit = unitOfScenario(units, sc);
      return {
        name: `${name}-eval`,
        description: `Runtime scenario ${sc.id}: ${sc.title}. Realises ${sc.flow}.`,
        dataset: name,
        evaluationLevel: 'turn',
        evaluators: [{ evaluator: 'builtin.task_adherence', initializationParameters: { model: judge } }, ...quality.map((q) => ({ evaluator: slug(q.id), initializationParameters: { model: judge } }))],
        ...(unit ? { target: { type: 'agent', name: unit.service } } : {}),
      };
    });
    services[`${slug(board.title || 'system')}-evals`] = {
      host: 'azure.ai.eval',
      uses: [AI_PROJECT, ...units.map((u) => u.service)],
      datasets: datasets.map((d) => ({ name: d.name, file: `./${d.path}` })),
      ...(quality.length
        ? { evaluators: quality.map((q) => ({ name: slug(q.id), definition: { type: 'rubric', dimensions: [{ id: 'measure', weight: 1, description: `${q.text}. Measure: ${q.measure ?? ''}` }] } })) }
        : {}),
      evals,
    };
  }

  const doc = {
    name: slug(board.title || 'agent-system'),
    metadata: { template: 'teolima' },
    requiredVersions: { extensions: { 'azure.ai.agents': '>=1.0.0-beta.8' } },
    infra: { provider: 'bicep', path: './infra', module: 'main' },
    hooks: {
      preprovision: {
        posix: { shell: 'pwsh', run: './infra/scripts/Invoke-PreflightChecks.ps1', continueOnError: false, interactive: true },
        windows: { shell: 'pwsh', run: './infra/scripts/Invoke-PreflightChecks.ps1', continueOnError: false, interactive: true },
      },
    },
    services,
  };
  return { doc, datasets, settings };
}

/** The checklist codes a review left partly or not met, for the report. */
export const openReview = (board: Board) => board.spec.reviews.filter((r) => r.status === 'partly' || r.status === 'not_met').map((r) => r.code);
