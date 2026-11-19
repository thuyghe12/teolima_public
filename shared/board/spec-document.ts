/**
 * The functional specification as a document: what the system must do and
 * why, grouped as Microsoft's architect guidance describes it, with every
 * statement traced to its source and the discovery topics still open.
 *
 * Plain Markdown, so it can be read in the app, pasted into a proposal, and
 * later extended into the design specification and statement of work.
 */
import { discovery } from './discovery';
import type { Board, Requirement, RequirementKind } from './schema';

export const KIND_TITLES: Record<RequirementKind, string> = {
  problem: 'Problem today',
  outcome: 'Outcomes',
  user: 'Users',
  scenario: 'Scenarios',
  functional: 'Functional requirements',
  oversight: 'Human oversight',
  nonfunctional: 'Nonfunctional requirements',
  constraint: 'Constraints',
  integration: 'Systems and data',
};

const ORDER: RequirementKind[] = ['problem', 'outcome', 'user', 'scenario', 'functional', 'oversight', 'integration', 'nonfunctional', 'constraint'];

const PILLAR_TITLES: Record<string, string> = {
  reliability: 'Reliability',
  security: 'Security',
  'cost-optimization': 'Cost Optimization',
  'operational-excellence': 'Operational Excellence',
  'performance-efficiency': 'Performance Efficiency',
};

/** Where a requirement comes from, in words. */
export function sourceLabel(r: Requirement, documents: Record<string, string> = {}): string {
  if (r.source.kind === 'brief') return 'the brief';
  if (r.source.kind === 'user') return 'said in the session';
  const id = r.source.document ?? '';
  return documents[id] ? `${documents[id]} (${id})` : id || 'a pasted document';
}

/** Requirements grouped by kind, in specification order, empty groups left out. */
export function grouped(board: Pick<Board, 'spec'>): { kind: RequirementKind; title: string; items: Requirement[] }[] {
  return ORDER.map((kind) => ({ kind, title: KIND_TITLES[kind], items: board.spec.requirements.filter((r) => r.kind === kind) })).filter(
    (g) => g.items.length,
  );
}

export function specMarkdown(board: Pick<Board, 'title' | 'brief' | 'spec'>, documents: Record<string, string> = {}): string {
  const lines: string[] = [`# Functional specification${board.title ? `: ${board.title}` : ''}`, ''];
  if (board.brief.goal) lines.push(`**Goal:** ${board.brief.goal}`, '');
  for (const g of grouped(board)) {
    lines.push(`## ${g.title}`, '');
    for (const r of g.items) {
      const pillar = r.pillar ? ` *(${PILLAR_TITLES[r.pillar]})*` : '';
      lines.push(`- **${r.id}** ${r.text}${pillar}`, `  > "${r.source.quote}" (${sourceLabel(r, documents)})`);
    }
    lines.push('');
  }
  const d = discovery(board);
  if (d.missing.length || d.open.length) {
    lines.push('## Open questions', '');
    for (const t of [...d.missing, ...d.open]) lines.push(`- **${t.title}**${t.required ? ' (required before design)' : ''}: ${t.question}`);
    lines.push('');
  }
  lines.push('---', '', 'Every statement quotes its source. Structure follows the functional specification in the Azure Well-Architected Framework architect guidance.', '');
  return lines.join('\n');
}
