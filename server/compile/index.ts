/**
 * Compile: an approved design to a complete Azure Developer CLI project
 * (ADR 0003). Deterministic: the same board and answers give the same files,
 * so recompiling shows a clean diff.
 *
 *   azure.yaml                      the Foundry project, agents, connections, routines, evaluations
 *   infra/                          the AI Landing Zone Bicep, unchanged
 *   infra/main.parameters.json      the landing zone's parameters, with the design's values as defaults
 *   src/agents/<service>/           code for hosted agents and self-hosted orchestration
 *   evals/datasets/                 one dataset per runtime scenario
 *   .github/workflows/azure-dev.yml provision and deploy with federated credentials
 *   docs/                           arc42 export of stages 1 to 3, ADRs, resources, audit trail
 *   manifest.json, teolima.json     where the foundation came from; the design and the answers
 */
import { stringify } from 'yaml';
import { DECISION_TOPICS, hostingOf } from '../../shared/board/arc42';
import { resourcePlan } from '../../shared/board/deployment';
import type { Change } from '../../shared/board/changes';
import type { Board, Component } from '../../shared/board/schema';
import { slug } from '../../shared/board/schema';
import { stageMarkdown } from '../../shared/board/spec-document';
import { dilemmas, type CompileAnswers, type Dilemma } from '../../shared/compile/wizard';
import { agentSources, units } from './agents';
import { azureYaml, openReview, SCHEMA_LINE } from './azure-yaml';
import { LANDING_ZONE, landingZoneFiles, parameterChanges, parametersFile } from './landing-zone';

export const COMPILER_VERSION = '1';

/** Where a file comes from, for the folder view's colours. */
export type Origin = 'landing-zone' | 'parameters' | 'generated' | 'document';

export interface CompiledFile {
  path: string;
  content: string;
  origin: Origin;
  /** The specification items and building blocks it serves. */
  serves: string[];
}

export type CompileResult =
  | { ok: true; files: CompiledFile[]; dilemmas: Dilemma[]; todo: string[] }
  | { ok: false; reason: string; dilemmas: Dilemma[] };

type Agent = Extract<Component, { kind: 'agent' }>;

export interface CompileInput {
  board: Board;
  answers?: CompileAnswers;
  /** The change log, written to docs/audit-trail.json. */
  changes?: Change[];
  /** Titles of pasted documents, by id, for the exported sources. */
  documents?: Record<string, string>;
}

export function compile({ board, answers = {}, changes = [], documents = {} }: CompileInput): CompileResult {
  const asked = dilemmas(board, answers);
  if (board.stage.current !== 'compile') return { ok: false, reason: 'Technical design is not approved yet.', dilemmas: asked };
  const open = asked.filter((d) => d.open);
  if (open.length) return { ok: false, reason: `Answer first: ${open.map((d) => d.question).join(' ')}`, dilemmas: asked };

  const model = (a: Agent) => a.model || answers.agentModels?.[a.id] || '';
  const plan = resourcePlan(board);
  const us = units(board);
  const files: CompiledFile[] = [];
  const add = (path: string, content: string, origin: Origin, serves: string[] = []) => files.push({ path, content, origin, serves: [...new Set(serves)] });

  // infra: the foundation, unchanged, and its parameters with the design's values
  const lz = landingZoneFiles();
  const changesToParams = parameterChanges(board, plan, answers);
  for (const [path, content] of lz) {
    if (path === 'main.parameters.json') add(`infra/${path}`, parametersFile(content, changesToParams), 'parameters', changesToParams.flatMap((c) => c.serves));
    else add(`infra/${path}`, content, 'landing-zone');
  }

  // azure.yaml
  const ay = azureYaml(board, us, model);
  add('azure.yaml', `${SCHEMA_LINE}\n${stringify(ay.doc, { lineWidth: 0 })}`, 'generated', board.components.map((c) => c.id));
  for (const d of ay.datasets) add(d.path, d.rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'generated', board.spec.scenarios.filter((s) => slug(s.title) === d.name).map((s) => s.flow));

  // agent code, unless the agents are prompt agents
  const hosting = hostingOf(board.spec.items.find((i) => i.type === 'decision' && i.topic === 'hosting')?.name) ?? 'Prompt agents';
  const todo: string[] = [];
  if (hosting === 'Prompt agents') {
    for (const u of us) add(`src/agents/${u.service}/README.md`, `# ${u.name}\n\nA prompt agent: Foundry Agent Service runs it from its definition in \`azure.yaml\`. There is no code to build.\n\nServes: ${u.agents[0].serves.join(', ')}.\n`, 'generated', u.agents.flatMap((a) => [a.id, ...a.serves]));
    for (const u of us) for (const t of u.agents[0].tools) todo.push(`Bind ${board.components.find((c) => c.id === t)?.name ?? t} to ${u.service} in Foundry; its connection is declared in azure.yaml.`);
    for (const a of board.components) if (a.kind === 'approval') todo.push(`Require approval for ${board.components.find((c) => c.id === a.gates)?.name ?? a.gates} on the prompt agent (${a.name}: ${a.condition}).`);
  } else {
    for (const { unit, files: src, stubs } of agentSources(board, model)) {
      for (const [name, content] of src) add(`src/agents/${unit.service}/${name}`, content, 'generated', unit.agents.flatMap((a) => [a.id, ...a.serves]));
      todo.push(...stubs.map((s) => `Implement src/agents/${s}.`));
    }
  }
  for (const s of ay.settings) todo.push(`Set ${s.name} with \`azd env set\`: ${s.why}.`);
  for (const k of board.components.filter((c) => c.kind === 'memory')) todo.push(`Wire memory "${k.name}" into the agents that read it.`);
  if (hosting === 'Self-hosted orchestration' && board.spec.scenarios.length) todo.push('Evaluate the runtime scenarios against the container app; azure.ai.eval targets Foundry agents only.');
  const review = openReview(board);
  if (review.length) todo.push(`Close or accept the ${review.length} Well-Architected recommendations the review left open (${review.join(', ')}); each is listed with its reason in docs/architecture.md, section 11.`);

  add('.github/workflows/azure-dev.yml', workflow(), 'generated');
  add('.gitignore', ['.azure/', '.env', '__pycache__/', '.venv/', ''].join('\n'), 'generated');
  add('manifest.json', `${JSON.stringify({ infra: { source: LANDING_ZONE }, generator: { name: 'teolima', version: COMPILER_VERSION } }, null, 2)}\n`, 'generated');
  add('teolima.json', `${JSON.stringify({ compiler: COMPILER_VERSION, answers, board }, null, 2)}\n`, 'generated');

  // docs
  const stages = (['discovery', 'solution', 'technical'] as const).map((s) => stageMarkdown(board, s, documents));
  add('docs/architecture.md', stages.join('\n\n'), 'document', board.spec.items.map((i) => i.id));
  board.spec.items
    .filter((i) => i.type === 'decision')
    .forEach((d, n) => add(`docs/adr/${String(n + 1).padStart(4, '0')}-${slug(d.name ?? d.id)}.md`, adr(board, d, n + 1), 'document', [d.id, ...(d.serves ?? [])]));
  add('docs/resources.md', resources(board, plan, changesToParams), 'document', plan.resources.flatMap((r) => r.serves));
  add('docs/audit-trail.json', `${JSON.stringify(changes, null, 2)}\n`, 'document');
  add('README.md', readme(board, hosting, todo, us.length), 'generated');

  files.sort((a, b) => a.path.localeCompare(b.path));
  return { ok: true, files, dilemmas: asked, todo };
}

function adr(board: Board, d: Board['spec']['items'][number], n: number): string {
  const approval = board.stage.approvals.find((a) => a.stage === 'solution');
  return [
    `# ${n}. ${d.name}`,
    '',
    `**Status:** Accepted${approval ? ` by ${approval.by} on ${approval.at.slice(0, 10)}` : ''}.`,
    '',
    '## Context',
    '',
    d.topic ? DECISION_TOPICS[d.topic].question || d.text : d.text,
    ...(d.serves?.length ? ['', `Answers ${d.serves.join(', ')}.`] : []),
    '',
    '## Options considered',
    '',
    ...(d.options ?? [d.name ?? '']).map((o) => `- ${o}${o === d.name ? ' (chosen)' : ''}`),
    '',
    '## Decision',
    '',
    d.text,
    '',
    '## Consequences',
    '',
    d.consequences ?? 'None recorded.',
    '',
    `*Source: ${d.source.quote ? `"${d.source.quote}", ` : ''}${d.source.kind === 'document' ? d.source.document : d.source.kind === 'typed' ? 'typed in the app' : 'said in the session'}. Guidance: ${d.topic ? DECISION_TOPICS[d.topic].guidance : ''}*`,
    '',
  ].join('\n');
}

function resources(board: Board, plan: ReturnType<typeof resourcePlan>, params: ReturnType<typeof parameterChanges>): string {
  const name = (id: string) => board.components.find((c) => c.id === id)?.name ?? id;
  return [
    '# Azure resources',
    '',
    `The design, ${plan.hosting.toLowerCase()} with ${plan.isolated ? 'private networking' : 'public endpoints'}, needs these resources. Each follows the Microsoft source linked.`,
    '',
    '| Service | Purpose | Runs or serves | Source |',
    '|---|---|---|---|',
    ...plan.resources.map((r) => `| ${r.service}${r.reused ? ' (platform landing zone)' : ''} | ${r.purpose} | ${r.serves.map(name).join(', ')} | [source](${r.source}) |`),
    '',
    '## The landing zone parameters the design sets',
    '',
    `The infrastructure is the [AI Landing Zone](${LANDING_ZONE.repo}) Bicep, ${LANDING_ZONE.tag} (commit \`${LANDING_ZONE.commit}\`), unchanged in \`infra/\`. These values in \`infra/main.parameters.json\` come from the design; each \`\${VARIABLE=default}\` can be changed per environment with \`azd env set\`. Every other parameter keeps the landing zone's default, which may deploy platform components beyond the list above, such as App Configuration and Key Vault.`,
    '',
    '| Parameter | Value | Because | Serves |',
    '|---|---|---|---|',
    ...params.map((p) => `| \`${p.name}\` | \`${typeof p.value === 'string' ? p.value : `${JSON.stringify(p.value).slice(0, 60)}${JSON.stringify(p.value).length > 60 ? '…' : ''}`}\` | ${p.because} | ${p.serves.join(', ')} |`),
    '',
  ].join('\n');
}

function readme(board: Board, hosting: string, todo: string[], unitCount: number): string {
  return [
    `# ${board.title || 'Agent system'}`,
    '',
    board.brief.goal,
    '',
    `An Azure Developer CLI project for Microsoft Foundry, compiled by Teolima from an approved design: ${unitCount} ${hosting === 'Prompt agents' ? 'prompt agent' : 'agent service'}${unitCount === 1 ? '' : 's'} (${hosting.toLowerCase()}) on the AI Landing Zone. The design and every decision behind it are in [docs/architecture.md](docs/architecture.md); the Azure resources and the parameters the design sets in [docs/resources.md](docs/resources.md).`,
    '',
    '## Layout',
    '',
    '| Path | What it is |',
    '|---|---|',
    '| `azure.yaml` | The Foundry project, the agents, connections, routines and evaluations |',
    '| `infra/` | The AI Landing Zone Bicep, unchanged; `main.parameters.json` carries the design\'s values |',
    '| `src/agents/` | One folder per agent service |',
    '| `evals/` | One dataset per runtime scenario |',
    '| `docs/` | The arc42 architecture, one ADR per decision, the resources and the audit trail |',
    '',
    '## Deploy',
    '',
    '```bash',
    'azd auth login',
    'azd env new <environment>',
    'azd provision     # the landing zone; its preflight check runs first',
    'azd deploy        # the agents',
    '```',
    '',
    'To deploy from GitHub, run `azd pipeline config`: it sets up federated credentials for `.github/workflows/azure-dev.yml`.',
    '',
    '## Before the first deploy',
    '',
    ...(todo.length ? todo.map((t) => `- [ ] ${t}`) : ['Nothing open.']),
    '',
  ].join('\n');
}

function workflow(): string {
  return `name: Provision and deploy

on:
  workflow_dispatch:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      AZURE_CLIENT_ID: \${{ vars.AZURE_CLIENT_ID }}
      AZURE_TENANT_ID: \${{ vars.AZURE_TENANT_ID }}
      AZURE_SUBSCRIPTION_ID: \${{ vars.AZURE_SUBSCRIPTION_ID }}
      AZURE_ENV_NAME: \${{ vars.AZURE_ENV_NAME }}
      AZURE_LOCATION: \${{ vars.AZURE_LOCATION }}
    steps:
      - uses: actions/checkout@v4
      - name: Install azd
        uses: Azure/setup-azd@v2.3.0
      - name: Log in with federated credentials
        shell: pwsh
        run: |
          azd auth login \`
            --client-id "$Env:AZURE_CLIENT_ID" \`
            --federated-credential-provider "github" \`
            --tenant-id "$Env:AZURE_TENANT_ID"
      - name: Provision
        run: azd provision --no-prompt
      - name: Deploy
        run: azd deploy --no-prompt
`;
}
