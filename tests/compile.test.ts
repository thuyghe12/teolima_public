import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { compile, type CompiledFile } from '../server/compile';
import { azdValidator } from '../server/compile/schemas';
import { declaredParameters, LANDING_ZONE_DIR, landingZoneFiles } from '../server/compile/landing-zone';
import { replay } from '../shared/board/changes';
import { emptyBoard } from '../shared/board/schema';
import { dilemmas } from '../shared/compile/wizard';
import { referenceAnswers, referenceCompiled, supportAnswersFor, supportCompiled } from './fixtures/compile-boards';
import { supportChanges } from './fixtures/support-board';

const support = () => {
  const board = supportCompiled();
  const r = compile({ board, answers: supportAnswersFor(board) });
  assert.ok(r.ok, 'reason' in r ? r.reason : '');
  return r.files;
};
const reference = () => {
  const r = compile({ board: referenceCompiled(), answers: referenceAnswers });
  assert.ok(r.ok, 'reason' in r ? r.reason : '');
  return r.files;
};
const file = (files: CompiledFile[], path: string) => {
  const f = files.find((x) => x.path === path);
  assert.ok(f, `${path} is compiled`);
  return f.content;
};

test('compile waits for technical design, then asks only what no stage settled', () => {
  const inSolution = replay(emptyBoard(), supportChanges);
  const early = compile({ board: inSolution });
  assert.ok('reason' in early && /not approved/.test(early.reason));

  const board = supportCompiled();
  const asked = dilemmas(board);
  // region, network and landing zone come prefilled from technical design: confirmed, not open
  for (const id of ['region', 'network', 'landing_zone'] as const) {
    const d = asked.find((x) => x.id === id)!;
    assert.ok(d.prefill && !d.open, id);
  }
  // the agents have no model on the board: that, and its version and capacity, are open
  assert.ok(asked.filter((d) => d.open).every((d) => d.id.startsWith('agent_model:')));
  const r = compile({ board });
  assert.ok('reason' in r && /Answer first/.test(r.reason));
  const partly = compile({ board, answers: { ...supportAnswersFor(board), models: {} } });
  assert.ok('reason' in partly && /gpt-4\.1: which version/.test(partly.reason), 'a model version is never guessed');
});

test('every compiled azure.yaml validates against the azd and Foundry extension schemas', () => {
  const validate = azdValidator();
  for (const [name, files] of [['support', support()], ['reference', reference()]] as const) {
    const yaml = parse(file(files, 'azure.yaml'));
    const ok = validate(yaml);
    assert.ok(ok, `${name}: ${JSON.stringify(validate.errors?.slice(0, 3))}`);
  }
  // and the check bites: an agent kind the schema does not know is refused
  const broken = parse(file(support(), 'azure.yaml'));
  broken.services['support-desk'].kind = 'workflow';
  assert.equal(validate(broken), false);
});

test('the infrastructure is the AI Landing Zone, unchanged, with only the design\'s parameters set', () => {
  const files = support();
  const lz = landingZoneFiles();
  for (const [path, content] of lz) {
    if (path === 'main.parameters.json') continue;
    assert.equal(file(files, `infra/${path}`), content, `infra/${path} is the landing zone's`);
  }
  const declared = declaredParameters(lz.get('main.bicep')!);
  const upstream = JSON.parse(lz.get('main.parameters.json')!).parameters as Record<string, { value: unknown }>;
  const compiled = JSON.parse(file(files, 'infra/main.parameters.json')).parameters as Record<string, { value: unknown }>;
  // only what the design sets is checked: the upstream file also sets parameters main.bicep no longer declares
  const changed = Object.keys(compiled).filter((k) => JSON.stringify(compiled[k]) !== JSON.stringify(upstream[k]));
  assert.ok(changed.length >= 8);
  for (const name of changed) {
    const value = compiled[name].value;
    assert.ok(declared.has(name), `${name} is a parameter of main.bicep`);
    const type = declared.get(name)!.replace('?', '');
    if (type === 'array' || type.endsWith('[]')) assert.ok(Array.isArray(value), `${name} is a list`);
    if (type === 'bool') assert.match(String(value), /^\$\{[A-Z_]+=(true|false)\}$/, `${name} is an azd boolean with its default`);
    if (type === 'string') assert.equal(typeof value, 'string', name);
  }
  assert.equal(compiled.location.value, '${AZURE_LOCATION=swedencentral}');
  assert.equal(compiled.networkIsolation.value, '${NETWORK_ISOLATION=true}');
  assert.equal(compiled.prepareHostedAgent.value, '${PREPARE_HOSTED_AGENT=true}');
  assert.deepEqual((compiled.modelDeploymentList.value as { model: unknown }[]).map((m) => m.model), [{ format: 'OpenAI', name: 'gpt-4.1', version: '2025-04-14' }]);
  const manifest = JSON.parse(file(files, 'manifest.json'));
  assert.equal(manifest.infra.source.commit, '97e2375b89dcda4900d75aac9e7ffb7b20cce165');
  assert.ok(readdirSync(LANDING_ZONE_DIR).includes('LICENSE'));
});

test('a handoff team on hosted agents compiles to one hosted agent running the handoff workflow', () => {
  const files = support();
  const yaml = parse(file(files, 'azure.yaml'));
  const svc = yaml.services['support-desk'];
  assert.equal(svc.host, 'azure.ai.agent');
  assert.equal(svc.kind, 'hosted');
  assert.deepEqual(svc.protocols, [{ protocol: 'responses', version: '2.0.0' }]);
  assert.ok(!('FOUNDRY_PROJECT_ENDPOINT' in svc.env), 'the platform injects the project endpoint');
  assert.equal(svc.env.PYTHONNOUSERSITE, '1');
  assert.equal(yaml.services['ai-project'].endpoint, '${AZURE_AI_PROJECT_ENDPOINT}');
  const main = file(files, 'src/agents/support-desk/main.py');
  assert.match(main, /from agent_framework\.orchestrations import HandoffBuilder/);
  assert.match(main, /HandoffBuilder\(name="support-desk", participants=\[triage, order_status, refunds, policy\]\)/);
  assert.match(main, /\.with_start_agent\(triage\)/);
  assert.match(main, /agent = workflow\.as_agent\(name="support-desk"\)/);
  assert.match(main, /ResponsesHostServer\(agent\)\.run\(\)/);
  const tools = file(files, 'src/agents/support-desk/tools.py');
  assert.match(tools, /@tool\(approval_mode="always_require"\)  # Refund approval: refunds over 100 EUR\ndef refund_api\(/);
  assert.match(tools, /@tool\ndef order_lookup\(/);
});

test('Microsoft\'s reference compiles to a self-hosted sequential team in Container Apps, as the page deploys it', () => {
  const files = reference();
  const yaml = parse(file(files, 'azure.yaml'));
  const svc = yaml.services.migration;
  assert.equal(svc.host, 'containerapp');
  assert.equal(svc.env.FOUNDRY_PROJECT_ENDPOINT, '${AZURE_AI_PROJECT_ENDPOINT}');
  const params = JSON.parse(file(files, 'infra/main.parameters.json')).parameters;
  assert.equal(params.deployContainerApps.value, '${DEPLOY_CONTAINER_APPS=true}');
  assert.deepEqual(params.containerAppsList.value.map((a: { service_name: string }) => a.service_name), ['migration'], 'the container app is the azd service');
  assert.deepEqual(params.databaseContainersList.value.map((d: { name: string }) => d.name), ['task-history']);
  const main = file(files, 'src/agents/migration/main.py');
  assert.match(main, /SequentialBuilder\(participants=\[sql_analysis, translation, validation, documentation\]\)\.build\(\)/);
  assert.match(main, /model=os\.environ\.get\("AZURE_AI_MODEL_DEPLOYMENT_NAME", "gpt-4\.1"\)/);
});

test('generated Python is valid Python', () => {
  const dir = mkdtempSync(join(tmpdir(), 'teolima-py-'));
  for (const f of [...support(), ...reference()].filter((x) => x.path.endsWith('.py'))) {
    const p = join(dir, f.path.replace(/\//g, '_'));
    writeFileSync(p, f.content);
    execFileSync('python3', ['-c', `import ast,sys; ast.parse(open(sys.argv[1]).read())`, p]);
  }
});

test('evaluations: one per runtime scenario, with a rubric for every quality scenario, targeting the agent service', () => {
  const files = support();
  const yaml = parse(file(files, 'azure.yaml'));
  const evals = yaml.services['customer-support-evals'];
  assert.equal(evals.host, 'azure.ai.eval');
  assert.equal(evals.evals.length, 1);
  assert.deepEqual(evals.evals[0].target, { type: 'agent', name: 'support-desk' });
  const dataset = file(files, evals.datasets[0].file.replace('./', ''));
  assert.ok(JSON.parse(dataset.trim()).query);
});

test('docs carry the whole design: three stages in arc42, an ADR per decision, the resources and parameters', () => {
  const files = support();
  const arch = file(files, 'docs/architecture.md');
  for (const h of ['## 1. Introduction and goals', '## 5. Building block view', '## 7. Deployment view', '## Well-Architected review']) assert.ok(arch.includes(h), h);
  const adrs = files.filter((f) => f.path.startsWith('docs/adr/'));
  assert.equal(adrs.length, 4);
  assert.match(file(files, 'docs/adr/0004-hosted-agents.md'), /- Hosted agents \(chosen\)/);
  assert.match(file(files, 'docs/resources.md'), /\| `networkIsolation` \| `\$\{NETWORK_ISOLATION=true\}` \|/);
  assert.match(file(files, 'README.md'), /- \[ \] Implement src\/agents\/support-desk\/tools\.py: refund_api/);
});

test('compiling is deterministic, and every file names where it comes from', () => {
  const a = support();
  const b = support();
  assert.deepEqual(a, b);
  const origin = (p: string) => a.find((f) => f.path === p)!.origin;
  assert.equal(origin('infra/main.bicep'), 'landing-zone');
  assert.equal(origin('infra/main.parameters.json'), 'parameters');
  assert.equal(origin('azure.yaml'), 'generated');
  assert.equal(origin('docs/architecture.md'), 'document');
  assert.ok(a.find((f) => f.path === 'src/agents/support-desk/main.py')!.serves.includes('flow-1'));
});

test('one agent on prompt agents compiles to a prompt agent with its search tool and tool connections, and no code', async () => {
  const { promptAgentCompiled } = await import('./fixtures/compile-boards');
  const board = promptAgentCompiled();
  assert.equal(board.stage.current, 'compile');
  const r = compile({ board, answers: { models: { 'gpt-4.1': { version: '2025-04-14', sku: 'GlobalStandard', capacity: 30 } } } });
  assert.ok(r.ok, 'reason' in r ? r.reason : '');
  assert.ok(azdValidator()(parse(file(r.files, 'azure.yaml'))), 'valid azure.yaml');
  const yaml = parse(file(r.files, 'azure.yaml'));
  const agent = yaml.services.support;
  assert.equal(agent.kind, 'prompt');
  assert.equal(agent.model, 'gpt-4.1');
  assert.equal(agent.instructions, 'Answer order questions and prepare refunds.');
  assert.deepEqual(agent.tools, [{ type: 'azure_ai_search', connection: 'policy-docs-search' }]);
  assert.deepEqual(agent.connections, ['order-lookup-tool', 'refund-api-tool']);
  assert.equal(yaml.services['refund-api-tool'].category, 'RemoteTool');
  assert.ok(!r.files.some((f) => f.path.endsWith('.py')), 'no code to build');
  assert.ok(r.todo.some((t) => t.startsWith('Bind Refund API to support in Foundry')));
});
