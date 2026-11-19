/**
 * Export: the compiled project as a zip, only when no blocking rule fails.
 * The rubric goes into the project as docs/checks.md, with every result,
 * every rule turned off and who approved the export, so the review travels
 * with the code.
 */
import { strToU8, zipSync } from 'fflate';
import type { CheckReport, RubricSettings } from '../../shared/compile/rubric';
import { DOMAINS } from '../../shared/compile/rubric';
import { check } from './checks';
import { compile, type CompileInput } from './index';

export interface ExportInput extends CompileInput {
  settings: RubricSettings;
  approvedBy: string;
  at: string;
}

export type ExportResult = { ok: true; name: string; zip: Uint8Array; report: CheckReport } | { ok: false; reason: string; report?: CheckReport };

export function checksMarkdown(report: CheckReport, settings: RubricSettings, approvedBy: string, at: string): string {
  const icon = { pass: 'Pass', fail: 'Fail', off: 'Off', skipped: 'Skipped' } as const;
  const lines = [
    '# Checks',
    '',
    `Every rule the compiled project was checked against before export. Approved for export by ${approvedBy} on ${at.slice(0, 10)}.`,
    '',
    '| Rule | Domain | Check | Method | Severity | Threshold | Result | Findings |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const r of report.results) {
    const findings = r.findings.map((f) => `${f.path ? `${f.path}${f.line ? `:${f.line}` : ''} ` : ''}${f.message}`).join('; ');
    lines.push(`| ${r.rule.source ? `[${r.rule.id}](${r.rule.source})` : r.rule.id} | ${DOMAINS[r.rule.domain]} | ${r.rule.check} | ${r.rule.method} | ${r.rule.severity} | ${r.rule.threshold ? `${r.rule.threshold.value}` : ''} | ${icon[r.status]} | ${findings.replace(/\|/g, '\\|')} |`);
  }
  if (settings.off.length) lines.push('', `Turned off in review: ${settings.off.join(', ')}.`);
  if (settings.custom.length) lines.push('', `Rules added in review: ${settings.custom.map((c) => `${c.id} (${c.expect} \`${c.pattern}\` under \`${c.path || '/'}\`)`).join(', ')}.`);
  return `${lines.join('\n')}\n`;
}

export function exportProject(input: ExportInput): ExportResult {
  if (!input.approvedBy.trim()) return { ok: false, reason: 'Name who approves the export.' };
  const r = compile(input);
  if (!('files' in r)) return { ok: false, reason: r.reason };
  const report = check(input.board, r.files, input.settings);
  if (report.blocking.length) return { ok: false, reason: `Blocking checks fail: ${report.blocking.map((b) => b.rule.id).join(', ')}.`, report };
  const name = (input.board.title || 'agent-system').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const tree: Record<string, Uint8Array> = {};
  for (const f of r.files) tree[`${name}/${f.path}`] = strToU8(f.content);
  tree[`${name}/docs/checks.md`] = strToU8(checksMarkdown(report, input.settings, input.approvedBy, input.at));
  return { ok: true, name, zip: zipSync(tree, { level: 6 }), report };
}
