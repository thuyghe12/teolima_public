/**
 * A stage document: its arc42 sections in order, then the sections the user
 * added, each with its items. The app renders it as an editable page, and it
 * exports as Markdown that can go straight into a proposal.
 */
import { ARC42, CHAPTERS, CONSTRAINT_CATEGORIES, QUALITY_ATTRIBUTES, sectionsOf, type SectionDef } from './arc42';
import { discovery } from './discovery';
import type { Board, SpecItem, StageId } from './schema';
import { stageOf } from './stages';

export interface DocSection {
  id: string;
  /** arc42 number, empty for a section the user added. */
  number: string;
  title: string;
  hint: string;
  custom: boolean;
  def?: SectionDef;
  items: SpecItem[];
}

/** The sections of a stage's document, template first, with their items in the order they were recorded. */
export function stageDocument(board: Pick<Board, 'spec'>, stage: StageId): DocSection[] {
  const items = board.spec.items;
  const template = sectionsOf(stage).map((def) => ({
    id: def.id,
    number: def.id,
    title: def.title,
    hint: def.hint,
    custom: false,
    def,
    items: items.filter((i) => i.section === def.id),
  }));
  const custom = board.spec.sections
    .filter((s) => s.stage === stage)
    .map((s) => ({ id: s.id, number: '', title: s.title, hint: '', custom: true, items: items.filter((i) => i.section === s.id) }));
  return [...template, ...custom];
}

/** Where an item comes from, in words. */
export function sourceLabel(item: SpecItem, documents: Record<string, string> = {}): string {
  switch (item.source.kind) {
    case 'brief':
      return 'the brief';
    case 'user':
      return 'said in the session';
    case 'typed':
      return 'typed in the app';
    case 'document': {
      const id = item.source.document ?? '';
      return documents[id] ? `${documents[id]} (${id})` : id || 'a pasted document';
    }
  }
}

/** The label of an item's type, with its attribute or category. */
export function itemLabel(section: DocSection, item: SpecItem): string {
  const type = section.def?.types.find((t) => t.id === item.type);
  if (item.attribute) return QUALITY_ATTRIBUTES[item.attribute].label;
  if (item.category) return CONSTRAINT_CATEGORIES[item.category];
  return type?.label ?? '';
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const source = (i: SpecItem, docs: Record<string, string>) => (i.source.quote ? `"${i.source.quote}", ${sourceLabel(i, docs)}` : sourceLabel(i, docs));

function sectionMarkdown(s: DocSection, docs: Record<string, string>): string[] {
  const out: string[] = [];
  if (!s.items.length) return [`*${s.hint || 'Nothing recorded yet.'}*`, ''];
  if (s.id === '1.2') {
    out.push('| Priority | Quality goal | Attribute | Source |', '|---|---|---|---|');
    s.items.forEach((i, n) => out.push(`| ${n + 1} | ${cell(i.text)} | ${i.attribute ? QUALITY_ATTRIBUTES[i.attribute].label : ''} | ${cell(source(i, docs))} |`));
  } else if (s.id === '1.3') {
    out.push('| Role | Expectation | Source |', '|---|---|---|');
    for (const i of s.items) out.push(`| ${cell(i.name ?? '')} | ${cell(i.text)} | ${cell(source(i, docs))} |`);
  } else if (s.id === '2') {
    out.push('| Constraint | Category | Source |', '|---|---|---|');
    for (const i of s.items) out.push(`| ${cell(i.text)} | ${i.category ? CONSTRAINT_CATEGORIES[i.category] : ''} | ${cell(source(i, docs))} |`);
  } else if (s.id === '3.2') {
    out.push('| Neighbour | Kind | Exchanged with the system | Source |', '|---|---|---|---|');
    for (const i of s.items) out.push(`| ${cell(i.name ?? '')} | ${i.type === 'person' ? 'Person' : 'External system'} | ${cell(i.text)} | ${cell(source(i, docs))} |`);
  } else {
    for (const i of s.items) {
      const label = itemLabel(s, i);
      out.push(`- ${label ? `**${label}:** ` : ''}${i.text}`, `  <br>*${source(i, docs)}*`);
    }
  }
  out.push('');
  return out;
}

/** A stage document as Markdown, numbered as arc42, with every source and the open questions. */
export function stageMarkdown(board: Pick<Board, 'title' | 'brief' | 'spec' | 'stage'>, stage: StageId, documents: Record<string, string> = {}): string {
  const st = stageOf(stage);
  const approval = board.stage.approvals.find((a) => a.stage === stage);
  const lines: string[] = [
    `# ${board.title || 'Architecture'}: ${st.title.toLowerCase()}`,
    '',
    `*${st.artifact}. For ${st.audience.toLowerCase()}.${approval ? ` Approved by ${approval.by} on ${approval.at.slice(0, 10)}.` : ' Not yet approved.'}*`,
    '',
  ];
  if (stage === 'discovery' && board.brief.goal) lines.push(`**In one sentence:** ${board.brief.goal}`, '');
  let chapter = '';
  for (const s of stageDocument(board, stage)) {
    if (s.custom) {
      lines.push(`## ${s.title}`, '');
    } else if (s.number.includes('.')) {
      // a subsection: its arc42 chapter heading first, once
      const c = s.number.split('.')[0];
      if (c !== chapter) lines.push(`## ${c}. ${CHAPTERS[c]}`, '');
      chapter = c;
      lines.push(`### ${s.number} ${s.title}`, '');
    } else {
      chapter = s.number;
      lines.push(`## ${s.number}. ${s.title}`, '');
    }
    lines.push(...sectionMarkdown(s, documents));
  }
  if (stage === 'discovery') {
    const d = discovery(board);
    if (d.missing.length || d.open.length) {
      lines.push('## Open questions', '');
      for (const t of [...d.missing, ...d.open]) lines.push(`- **${t.title}**${t.required ? ' (needed before approval)' : ''}: ${t.question}`);
      lines.push('');
    }
  }
  lines.push('---', '', `Structured as [arc42](${ARC42}), sections ${sectionsOf(stage).map((s) => s.id).join(', ')}. Content follows the Azure Well-Architected Framework architect guidance. Every statement names its source.`, '');
  return lines.join('\n');
}
