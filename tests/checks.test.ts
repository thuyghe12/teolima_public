import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, type CompiledFile } from '../server/compile';
import { check, RULES } from '../server/compile/checks';
import { emptySettings } from '../shared/compile/rubric';
import { supportAnswersFor, supportCompiled, referenceAnswers, referenceCompiled, promptAgentCompiled } from './fixtures/compile-boards';

const compiled = () => {
  const board = supportCompiled();
  const r = compile({ board, answers: supportAnswersFor(board) });
  assert.ok(r.ok);
  return { board, files: r.files };
};
const edit = (files: CompiledFile[], path: string, change: (s: string) => string) => files.map((f) => (f.path === path ? { ...f, content: change(f.content) } : f));
const result = (report: ReturnType<typeof check>, id: string) => report.results.find((r) => r.rule.id === id)!;

test('every rule is narrow and sourced: one signal, a method, a severity, and where it comes from', () => {
  const ids = new Set<string>();
  for (const r of RULES) {
    assert.match(r.id, /^[A-Z]{3}-\d{2}$/);
    assert.ok(!ids.has(r.id), r.id);
    ids.add(r.id);
    assert.ok(r.signal && r.check.endsWith('.') && /^https:\/\//.test(r.source), r.id);
  }
  assert.ok(RULES.length >= 18);
});

test('the compiled designs pass every rule: support desk, Microsoft reference, one prompt agent', () => {
  const cases = [compiled(), (() => { const board = referenceCompiled(); const r = compile({ board, answers: referenceAnswers }); assert.ok(r.ok); return { board, files: r.files }; })(), (() => { const board = promptAgentCompiled(); const r = compile({ board, answers: { models: { 'gpt-4.1': { version: '2025-04-14', sku: 'GlobalStandard', capacity: 30 } } } }); assert.ok(r.ok); return { board, files: r.files }; })()];
  for (const { board, files } of cases) {
    const report = check(board, files, emptySettings());
    const failed = report.results.filter((r) => r.status === 'fail');
    assert.deepEqual(failed.map((r) => `${r.rule.id}: ${r.findings.map((f) => f.message).join('; ')}`), [], board.title);
  }
});

test('each rule bites on the one signal it owns', () => {
  const { board, files } = compiled();
  const run = (f: CompiledFile[]) => check(board, f, emptySettings());
  assert.equal(result(run(edit(files, 'azure.yaml', (s) => s.replace('kind: hosted', 'kind: workflow'))), 'AZD-01').status, 'fail');
  assert.equal(result(run(edit(files, 'azure.yaml', (s) => s.replace('PYTHONNOUSERSITE: "1"', 'PYTHONNOUSERSITE: "1"\n      FOUNDRY_PROJECT_ENDPOINT: x'))), 'AZD-03').status, 'fail');
  assert.equal(result(run(edit(files, 'infra/main.bicep', (s) => `${s}\n// changed`)), 'INF-01').status, 'fail');
  assert.equal(result(run(edit(files, 'infra/main.parameters.json', (s) => s.replace('"parameters": {', '"parameters": {\n    "notAParameter": { "value": 1 },'))), 'INF-02').status, 'fail');
  assert.equal(result(run(edit(files, 'infra/main.parameters.json', (s) => s.replace('AZURE_LOCATION=swedencentral', 'AZURE_LOCATION=eastus'))), 'INF-04').status, 'fail');
  assert.equal(result(run(edit(files, 'src/agents/support-desk/main.py', (s) => s.replace('import os', `import os\nKEY = "${'AIza' + 'Sy' + 'X'.repeat(33)}"`))), 'SEC-01').status, 'fail');
  assert.equal(result(run(edit(files, 'src/agents/support-desk/tools.py', (s) => s.replace('@tool(approval_mode="always_require")', '@tool'))), 'SEC-03').status, 'fail');
  assert.equal(result(run(edit(files, 'src/agents/support-desk/main.py', (s) => s.replace('def main() -> None:', 'def main( -> None:'))), 'AGT-01').status, 'fail');
  assert.equal(result(run(edit(files, 'src/agents/support-desk/main.py', (s) => s.replace(/HandoffBuilder/g, 'SomethingElse'))), 'AGT-02').status, 'fail');
});

test('a failing blocking rule blocks the export; turned off, it is recorded as off', () => {
  const { board, files } = compiled();
  const broken = edit(files, 'infra/main.parameters.json', (s) => s.replace('AZURE_LOCATION=swedencentral', 'AZURE_LOCATION=eastus'));
  assert.deepEqual(check(board, broken, emptySettings()).blocking.map((r) => r.rule.id), ['INF-04']);
  const off = check(board, broken, { ...emptySettings(), off: ['INF-04'] });
  assert.equal(result(off, 'INF-04').status, 'off');
  assert.equal(off.blocking.length, 0);
});

test('thresholds can be adjusted, and the user can add rules of their own', () => {
  const { board, files } = compiled();
  assert.equal(result(check(board, files, { ...emptySettings(), thresholds: { 'INF-03': 100 } }), 'INF-03').status, 'fail', 'capacity 50 is below 100');
  const settings = {
    ...emptySettings(),
    custom: [
      { id: 'OWN-1', check: 'Agents log nothing with print.', path: 'src/agents/', pattern: '\\bprint\\(', expect: 'absent' as const, severity: 'block' as const },
      { id: 'OWN-2', check: 'Every project names its owner.', path: 'README.md', pattern: 'Owner:', expect: 'present' as const, severity: 'warn' as const },
    ],
  };
  const report = check(board, files, settings);
  assert.equal(result(report, 'OWN-1').status, 'pass');
  assert.equal(result(report, 'OWN-2').status, 'fail');
  assert.equal(result(check(board, edit(files, 'src/agents/support-desk/main.py', (s) => s.replace('load_dotenv()', 'load_dotenv()\nprint("hi")')), settings), 'OWN-1').findings[0].path, 'src/agents/support-desk/main.py');
});

test('export: a zip of the project with docs/checks.md, only when nothing blocks and a person approves', async () => {
  const { exportProject } = await import('../server/compile/export');
  const { unzipSync, strFromU8 } = await import('fflate');
  const board = supportCompiled();
  const input = { board, answers: supportAnswersFor(board), settings: emptySettings(), at: '2026-11-19T18:00:00.000Z' };
  const nobody = exportProject({ ...input, approvedBy: ' ' });
  assert.ok('reason' in nobody && /approves/.test(nobody.reason));
  const blocked = exportProject({ ...input, approvedBy: 'Platform lead', overrides: { location: '${AZURE_LOCATION=eastus}' } });
  assert.ok('reason' in blocked && /INF-04/.test(blocked.reason), 'a region outside the EU blocks the export');
  const r = exportProject({ ...input, approvedBy: 'Platform lead' });
  assert.ok(r.ok);
  const zip = unzipSync(r.zip);
  assert.ok(zip['customer-support/azure.yaml'] && zip['customer-support/infra/main.bicep']);
  const checks = strFromU8(zip['customer-support/docs/checks.md']);
  assert.match(checks, /Approved for export by Platform lead on 2026-11-19/);
  assert.match(checks, /\| \[INF-04\]\(https:\/\/azure\.microsoft\.com[^)]*\) \| Infrastructure \|.*\| Pass \|/);
});

test('a parameter changed in review is marked as such, and its check reruns', () => {
  const board = supportCompiled();
  const r = compile({ board, answers: supportAnswersFor(board), overrides: { networkIsolation: '${NETWORK_ISOLATION=false}' } });
  assert.ok('parameters' in r);
  const p = r.parameters.find((x) => x.name === 'networkIsolation')!;
  assert.ok(p.edited && /Changed in review/.test(p.because));
  assert.equal(result(check(board, r.files, emptySettings()), 'INF-05').status, 'fail', 'public endpoints with a regulatory constraint warn');
});

test('a user rule that could backtrack without end is refused, not run', () => {
  const { board, files } = compiled();
  const settings = { ...emptySettings(), custom: [{ id: 'OWN-3', check: 'Nested repeat.', path: '', pattern: '(a+)+$', expect: 'absent' as const, severity: 'warn' as const }] };
  const r = result(check(board, files, settings), 'OWN-3');
  assert.equal(r.status, 'fail');
  assert.match(r.findings[0].message, /pattern refused/);
});

test('table cells escape backslashes before pipes', async () => {
  const { cell } = await import('../shared/board/spec-document');
  assert.equal(cell('a\\|b\nc'), 'a\\\\\\|b c');
});
