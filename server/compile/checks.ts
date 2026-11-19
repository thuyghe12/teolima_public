/**
 * The rules the compiled project is checked against (shared/compile/rubric.ts).
 * Each rule owns one signal and receives only the files it needs. All are
 * deterministic: schemas, code and regular expressions.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { hostingOf } from '../../shared/board/arc42';
import type { Board } from '../../shared/board/schema';
import type { CheckReport, CustomRule, Finding, Rule, RuleResult, RubricSettings } from '../../shared/compile/rubric';
import type { CompiledFile } from './index';
import { declaredParameters, landingZoneFiles } from './landing-zone';
import { azdValidator } from './schemas';

const LEARN = 'https://learn.microsoft.com/en-us/azure';
const AZD_SCHEMA = 'https://github.com/Azure/azure-dev/blob/main/schemas/v1.0/azure.yaml.json';
const BASELINE = `${LEARN}/architecture/ai-ml/architecture/baseline-microsoft-foundry-chat`;
const EU_REGIONS = ['westeurope', 'northeurope', 'swedencentral', 'francecentral', 'francesouth', 'germanywestcentral', 'germanynorth', 'italynorth', 'polandcentral', 'spaincentral'];

interface Input {
  board: Board;
  files: CompiledFile[];
  settings: RubricSettings;
}

type Check = (input: Input, threshold: number) => Finding[] | 'skipped';

const at = (files: CompiledFile[], path: string) => files.find((f) => f.path === path);
const yamlOf = (files: CompiledFile[]) => parse(at(files, 'azure.yaml')?.content ?? '') ?? {};
const params = (files: CompiledFile[]) => (JSON.parse(at(files, 'infra/main.parameters.json')?.content ?? '{"parameters":{}}').parameters ?? {}) as Record<string, { value: unknown }>;
const defaultOf = (v: unknown) => (typeof v === 'string' ? /=([^}]*)\}$/.exec(v)?.[1] : undefined);
const services = (files: CompiledFile[]) => Object.entries((yamlOf(files).services ?? {}) as Record<string, Record<string, unknown>>);
const lineOf = (content: string, index: number) => content.slice(0, index).split('\n').length;

export const RULES: (Rule & { run: Check })[] = [
  {
    id: 'AZD-01', domain: 'azd', signal: 'azure.yaml', method: 'schema', severity: 'block', source: AZD_SCHEMA,
    check: 'azure.yaml validates against the azd schema and the Foundry extension schemas.',
    run: ({ files }) => {
      const v = azdValidator();
      return v(yamlOf(files)) ? [] : (v.errors ?? []).slice(0, 5).map((e) => ({ path: 'azure.yaml', message: `${e.instancePath || '/'} ${e.message}` }));
    },
  },
  {
    id: 'AZD-02', domain: 'azd', signal: 'azure.yaml services', method: 'code', severity: 'block', source: `${LEARN}/foundry/agents/concepts/azure-yaml-reference`,
    check: 'Every agent, connection, routine and evaluation uses the Foundry project service.',
    run: ({ files }) => {
      const out: Finding[] = [];
      for (const [name, s] of services(files)) {
        if (String(s.host).startsWith('azure.ai.') && s.host !== 'azure.ai.project' && s.host !== 'azure.ai.routine' && !(s.uses as string[] | undefined)?.includes('ai-project')) out.push({ path: 'azure.yaml', message: `${name} does not use ai-project` });
      }
      return out;
    },
  },
  {
    id: 'AZD-03', domain: 'azd', signal: 'azure.yaml env of hosted agents', method: 'code', severity: 'block', source: `${LEARN}/foundry/agents/how-to/configure-hosted-agent-env-variables`,
    check: 'No hosted agent declares FOUNDRY_PROJECT_ENDPOINT: the platform injects it.',
    run: ({ files }) => services(files).filter(([, s]) => s.kind === 'hosted' && s.env && 'FOUNDRY_PROJECT_ENDPOINT' in (s.env as object)).map(([n]) => ({ path: 'azure.yaml', message: `${n} declares FOUNDRY_PROJECT_ENDPOINT` })),
  },
  {
    id: 'AZD-04', domain: 'azd', signal: 'azure.yaml project paths', method: 'code', severity: 'block', source: AZD_SCHEMA,
    check: 'Every service folder named in azure.yaml exists in the project.',
    run: ({ files }) => services(files).flatMap(([n, s]) => {
      const project = typeof s.project === 'string' ? s.project.replace(/^\.\//, '') : null;
      return project && !files.some((f) => f.path.startsWith(`${project}/`)) ? [{ path: 'azure.yaml', message: `${n}: ${project} is missing` }] : [];
    }),
  },
  {
    id: 'INF-01', domain: 'infrastructure', signal: 'infra/', method: 'code', severity: 'block', source: 'https://github.com/Azure/bicep-ptn-aiml-landing-zone/tree/v2.7.3',
    check: 'The infrastructure is the AI Landing Zone, unchanged apart from its parameters.',
    run: ({ files }) => {
      const lz = landingZoneFiles();
      const out: Finding[] = [];
      for (const [p, content] of lz) if (p !== 'main.parameters.json' && at(files, `infra/${p}`)?.content !== content) out.push({ path: `infra/${p}`, message: 'differs from the landing zone' });
      for (const f of files) if (f.path.startsWith('infra/') && !lz.has(f.path.slice(6))) out.push({ path: f.path, message: 'is not part of the landing zone' });
      return out;
    },
  },
  {
    id: 'INF-02', domain: 'infrastructure', signal: 'infra/main.parameters.json', method: 'code', severity: 'block', source: 'https://github.com/Azure/bicep-ptn-aiml-landing-zone/blob/v2.7.3/main.bicep',
    check: 'Every parameter the design sets is declared by the landing zone, with a value of its type.',
    run: ({ files }) => {
      const lz = landingZoneFiles();
      const declared = declaredParameters(lz.get('main.bicep')!);
      const upstream = JSON.parse(lz.get('main.parameters.json')!).parameters;
      const out: Finding[] = [];
      for (const [name, { value }] of Object.entries(params(files))) {
        if (JSON.stringify(upstream[name]?.value) === JSON.stringify(value)) continue;
        const type = declared.get(name)?.replace('?', '');
        if (!type) out.push({ path: 'infra/main.parameters.json', message: `${name} is not a parameter of main.bicep` });
        else if ((type === 'array' || type.endsWith('[]')) && !Array.isArray(value)) out.push({ path: 'infra/main.parameters.json', message: `${name} must be a list` });
        else if (type === 'bool' && !/^\$\{[A-Z_]+=(true|false)\}$/.test(String(value)) && typeof value !== 'boolean') out.push({ path: 'infra/main.parameters.json', message: `${name} must be a boolean` });
      }
      return out;
    },
  },
  {
    id: 'INF-03', domain: 'infrastructure', signal: 'modelDeploymentList', method: 'code', severity: 'block', source: `${BASELINE}#model-and-tool-selection`,
    check: 'Every model deployment names an exact version and at least the minimum capacity.',
    threshold: { label: 'Minimum capacity (thousands of tokens per minute)', value: 1, min: 1, max: 1000 },
    run: ({ files }, min) => {
      const list = (params(files).modelDeploymentList?.value ?? []) as { name: string; model: { version: string }; sku: { capacity: number } }[];
      return list.flatMap((m) => [
        ...(!m.model?.version ? [{ path: 'infra/main.parameters.json', message: `${m.name} has no version` }] : []),
        ...((m.sku?.capacity ?? 0) < min ? [{ path: 'infra/main.parameters.json', message: `${m.name} capacity ${m.sku?.capacity ?? 0} is below ${min}` }] : []),
      ]);
    },
  },
  {
    id: 'INF-04', domain: 'infrastructure', signal: 'location and the constraints in section 2', method: 'code', severity: 'block', source: 'https://azure.microsoft.com/explore/global-infrastructure/geographies/',
    check: 'When a constraint keeps data in the EU, the region is in the EU.',
    run: ({ board, files }) => {
      const eu = board.spec.items.some((i) => i.section === '2' && /\b(EU|Europe|European)\b/.test(i.text));
      if (!eu) return [];
      const region = defaultOf(params(files).location?.value) ?? '';
      return EU_REGIONS.includes(region) ? [] : [{ path: 'infra/main.parameters.json', message: `${region || 'no region'} is not an EU region` }];
    },
  },
  {
    id: 'INF-05', domain: 'infrastructure', signal: 'networkIsolation and the security requirements', method: 'code', severity: 'warn', source: `${BASELINE}#security`,
    check: 'With a regulatory constraint or a security quality goal, networking is private.',
    run: ({ board, files }) => {
      const sensitive = board.spec.items.some((i) => (i.section === '2' && i.category === 'regulatory') || (i.section === '1.2' && ['security', 'privacy', 'compliance'].includes(i.attribute ?? '')));
      return sensitive && defaultOf(params(files).networkIsolation?.value) !== 'true' ? [{ path: 'infra/main.parameters.json', message: 'public endpoints for a workload with security or regulatory requirements' }] : [];
    },
  },
  {
    id: 'SEC-01', domain: 'security', signal: 'every generated file', method: 'regex', severity: 'block', source: `${LEARN}/well-architected/security/application-secrets`,
    check: 'No secret appears in any generated file: no API keys, connection strings or private keys.',
    run: ({ files }) => {
      const patterns = [/AIza[0-9A-Za-z_-]{30,}/, /\bsk-[A-Za-z0-9]{20,}/, /AccountKey=[A-Za-z0-9+/=]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /(?:password|secret|apikey|api_key)\s*[:=]\s*["'][^"'$\s{]{8,}["']/i];
      const out: Finding[] = [];
      for (const f of files.filter((x) => x.origin !== 'landing-zone')) {
        for (const p of patterns) {
          const m = p.exec(f.content);
          if (m) out.push({ path: f.path, line: lineOf(f.content, m.index), message: 'looks like a secret' });
        }
      }
      return out;
    },
  },
  {
    id: 'SEC-02', domain: 'security', signal: 'azure.yaml connections', method: 'code', severity: 'block', source: `${LEARN}/well-architected/security/identity-access`,
    check: 'Every connection authenticates with Microsoft Entra ID or a managed identity, never a key.',
    run: ({ files }) => services(files).filter(([, s]) => s.host === 'azure.ai.connection' && !['AAD', 'ManagedIdentity', 'ProjectManagedIdentity', 'UserEntraToken', 'AgenticIdentityToken'].includes(String(s.authType))).map(([n, s]) => ({ path: 'azure.yaml', message: `${n} uses ${s.authType}` })),
  },
  {
    id: 'SEC-03', domain: 'security', signal: 'approvals on the board and the agent code', method: 'code', severity: 'block', source: `${LEARN}/architecture/ai-ml/guide/ai-agent-design-patterns#human-participation`,
    check: 'Every approval on the board is enforced: an approval-gated tool in the code, or a step in the README for prompt agents.',
    run: ({ board, files }) => {
      const out: Finding[] = [];
      const readme = at(files, 'README.md')?.content ?? '';
      const code = files.filter((f) => f.path.endsWith('tools.py')).map((f) => f.content).join('\n');
      for (const a of board.components) {
        if (a.kind !== 'approval') continue;
        const target = board.components.find((c) => c.id === a.gates)?.name ?? a.gates;
        const enforced = code.includes(`approval_mode="always_require")  # ${a.name}`) || readme.includes(`Require approval for ${target}`);
        if (!enforced) out.push({ message: `${a.name} on ${target} is not enforced` });
      }
      return out;
    },
  },
  {
    id: 'AGT-01', domain: 'agents', signal: 'src/**/*.py', method: 'code', severity: 'block', source: 'https://docs.python.org/3/library/ast.html',
    check: 'Every generated Python file parses.',
    run: ({ files }) => {
      const py = files.filter((f) => f.path.endsWith('.py'));
      if (!py.length) return [];
      const dir = mkdtempSync(join(tmpdir(), 'teolima-check-'));
      try {
        const out: Finding[] = [];
        for (const f of py) {
          const p = join(dir, f.path.replace(/\//g, '_'));
          writeFileSync(p, f.content);
          try {
            execFileSync('python3', ['-c', 'import ast,sys; ast.parse(open(sys.argv[1]).read())', p], { stdio: 'pipe' });
          } catch (e) {
            const err = e as { code?: string; stderr?: Buffer };
            if (err.code === 'ENOENT') return 'skipped';
            out.push({ path: f.path, message: String(err.stderr ?? 'does not parse').trim().split('\n').at(-1) ?? 'does not parse' });
          }
        }
        return out;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    id: 'AGT-02', domain: 'agents', signal: 'src/agents/*/main.py', method: 'regex', severity: 'block', source: 'https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations',
    check: "Every team runs its orchestration pattern's builder, wrapped as one agent and served with the Responses protocol.",
    run: ({ board, files }) => {
      const builder = { sequential: 'SequentialBuilder', concurrent: 'ConcurrentBuilder', handoff: 'HandoffBuilder', group_chat: 'GroupChatBuilder', magentic: 'MagenticBuilder' } as const;
      const hosting = hostingOf(board.spec.items.find((i) => i.type === 'decision' && i.topic === 'hosting')?.name);
      if (hosting === 'Prompt agents') return [];
      const code = files.filter((f) => f.path.endsWith('/main.py')).map((f) => f.content).join('\n');
      return board.teams.flatMap((t) => (new RegExp(`${builder[t.pattern]}\\(`).test(code) && /workflow\.as_agent\(/.test(code) && /ResponsesHostServer\(agent\)/.test(code) ? [] : [{ message: `${t.name} does not run ${builder[t.pattern]}` }]));
    },
  },
  {
    id: 'AGT-03', domain: 'agents', signal: 'src/agents/*/requirements.txt', method: 'regex', severity: 'block', source: 'https://pypi.org/project/agent-framework-foundry-hosting/',
    check: 'Prerelease dependencies are pinned to an exact version.',
    run: ({ files }) => files.filter((f) => f.path.endsWith('requirements.txt') && /^agent-framework-foundry-hosting\s*$/m.test(f.content)).map((f) => ({ path: f.path, message: 'agent-framework-foundry-hosting is not pinned' })),
  },
  {
    id: 'AGT-04', domain: 'agents', signal: 'tools.py and README.md', method: 'code', severity: 'warn', source: 'https://github.com/thuyghe12/teolima_public/blob/main/docs/adr/0003-compile-to-foundry-package.md',
    check: 'Every tool stub still to connect is listed in the README.',
    run: ({ files }) => {
      const readme = at(files, 'README.md')?.content ?? '';
      return files.filter((f) => f.path.endsWith('tools.py')).flatMap((f) => [...f.content.matchAll(/^def (\w+)\(/gm)].filter((m) => !readme.includes(`: ${m[1]} (`)).map((m) => ({ path: f.path, message: `${m[1]} is not listed` })));
    },
  },
  {
    id: 'TRC-01', domain: 'traceability', signal: 'the building blocks on the board', method: 'code', severity: 'block', source: 'https://docs.arc42.org/section-5/',
    check: 'At least the threshold share of building blocks appears in the compiled project.',
    threshold: { label: 'Share of building blocks compiled (%)', value: 100, min: 50, max: 100 },
    run: ({ board, files }, share) => {
      const covered = new Set(files.flatMap((f) => f.serves));
      const blocks = board.components.filter((c) => c.kind !== 'output' && c.kind !== 'guardrail' && c.kind !== 'trigger');
      const missing = blocks.filter((c) => !covered.has(c.id) && !files.some((f) => f.content.includes(c.name)));
      return blocks.length && ((blocks.length - missing.length) / blocks.length) * 100 < share ? missing.map((c) => ({ message: `${c.name} (${c.kind}) is not in the project` })) : [];
    },
  },
  {
    id: 'TRC-02', domain: 'traceability', signal: 'docs/adr/', method: 'code', severity: 'block', source: 'https://docs.arc42.org/section-9/',
    check: 'Every decision record of solution design has its ADR.',
    run: ({ board, files }) => {
      const adrs = files.filter((f) => f.path.startsWith('docs/adr/')).map((f) => f.content).join('\n');
      return board.spec.items.filter((i) => i.type === 'decision' && !adrs.includes(i.text)).map((i) => ({ message: `${i.id} (${i.name}) has no ADR` }));
    },
  },
  {
    id: 'EVL-01', domain: 'evaluation', signal: 'azure.yaml evaluations', method: 'code', severity: 'block', source: `${LEARN}/cloud-adoption-framework/ai-agents/operational-standards`,
    check: 'Every runtime scenario has an evaluation, and every quality scenario a rubric evaluator.',
    run: ({ board, files }) => {
      const hosting = hostingOf(board.spec.items.find((i) => i.type === 'decision' && i.topic === 'hosting')?.name);
      if (hosting === 'Self-hosted orchestration') return 'skipped';
      const evalSvc = services(files).find(([, s]) => s.host === 'azure.ai.eval')?.[1] as { evals?: { description?: string }[]; evaluators?: { name: string }[] } | undefined;
      const out: Finding[] = [];
      for (const sc of board.spec.scenarios) if (!evalSvc?.evals?.some((e) => e.description?.includes(sc.id))) out.push({ path: 'azure.yaml', message: `${sc.id} has no evaluation` });
      for (const q of board.spec.items.filter((i) => i.type === 'quality_scenario')) if (!evalSvc?.evaluators?.some((e) => e.name === q.id)) out.push({ path: 'azure.yaml', message: `${q.id} has no rubric evaluator` });
      return out;
    },
  },
  {
    id: 'DOC-01', domain: 'documentation', signal: 'docs/architecture.md', method: 'code', severity: 'block', source: 'https://docs.arc42.org/home/',
    check: 'The architecture document carries all three stages and the Well-Architected review.',
    run: ({ files }) => {
      const doc = at(files, 'docs/architecture.md')?.content ?? '';
      return ['## 1. Introduction and goals', '## 4. Solution strategy', '## 7. Deployment view', '## Well-Architected review'].filter((h) => !doc.includes(h)).map((h) => ({ path: 'docs/architecture.md', message: `missing ${h.slice(3)}` }));
    },
  },
  {
    id: 'DOC-02', domain: 'documentation', signal: 'the Well-Architected review', method: 'code', severity: 'warn', source: `${LEARN}/well-architected/`,
    check: 'Every recommendation not met says why, and is listed as still open in the README.',
    run: ({ board, files }) => {
      const readme = at(files, 'README.md')?.content ?? '';
      return board.spec.reviews
        .filter((r) => r.status === 'partly' || r.status === 'not_met')
        .flatMap((r) => [...(!r.note ? [{ message: `${r.code} has no reason` }] : []), ...(!readme.includes(r.code) ? [{ path: 'README.md', message: `${r.code} is not listed as open` }] : [])]);
    },
  },
];

function custom(rule: CustomRule): Rule & { run: Check } {
  return {
    id: rule.id,
    domain: 'custom',
    signal: rule.path || 'every file',
    check: rule.check,
    method: 'regex',
    severity: rule.severity,
    source: '',
    run: ({ files }) => {
      let re: RegExp;
      try {
        re = new RegExp(rule.pattern, 'm');
      } catch {
        return [{ message: `invalid pattern ${rule.pattern}` }];
      }
      const scope = files.filter((f) => f.path.startsWith(rule.path));
      if (rule.expect === 'present') return scope.some((f) => re.test(f.content)) ? [] : [{ message: `"${rule.pattern}" not found under ${rule.path || '/'}` }];
      return scope.flatMap((f) => {
        const m = re.exec(f.content);
        return m ? [{ path: f.path, line: lineOf(f.content, m.index), message: `"${rule.pattern}" found` }] : [];
      });
    },
  };
}

/** Runs every rule on the compiled project, with the user's settings. */
export function check(board: Board, files: CompiledFile[], settings: RubricSettings): CheckReport {
  const rules = [...RULES, ...settings.custom.map(custom)];
  const results: RuleResult[] = rules.map(({ run, ...rule }) => {
    const threshold = rule.threshold ? { ...rule.threshold, value: settings.thresholds[rule.id] ?? rule.threshold.value } : undefined;
    const r: Rule = { ...rule, ...(threshold ? { threshold } : {}) };
    if (settings.off.includes(rule.id)) return { rule: r, status: 'off', findings: [] };
    const out = run({ board, files, settings }, threshold?.value ?? 0);
    if (out === 'skipped') return { rule: r, status: 'skipped', findings: [] };
    return { rule: r, status: out.length ? 'fail' : 'pass', findings: out };
  });
  return { results, blocking: results.filter((r) => r.status === 'fail' && r.rule.severity === 'block') };
}
