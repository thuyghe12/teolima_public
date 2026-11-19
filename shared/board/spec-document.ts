/**
 * A stage document: its arc42 sections in order, then the sections the user
 * added, each with its items. The app renders it as an editable page, and it
 * exports as Markdown that can go straight into a proposal.
 */
import { ARC42, CHAPTERS, CONSTRAINT_CATEGORIES, DECISION_TOPICS, QUALITY_ATTRIBUTES, sectionsOf, type SectionDef } from './arc42';
import { discovery } from './discovery';
import type { Board, Component, Scenario, SpecItem, StageId } from './schema';
import { stageOf, traceability } from './stages';

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

export const KIND_LABELS: Record<Component['kind'], string> = {
  trigger: 'Entry point',
  agent: 'Agent',
  tool: 'Tool',
  knowledge: 'Knowledge',
  memory: 'Memory',
  guardrail: 'Guardrail',
  approval: 'Approval',
  output: 'Output',
};

/** The specification items a building block must trace to: user flows, requirements, oversight rules and external systems. */
export function traceTargets(board: Pick<Board, 'spec'>): SpecItem[] {
  return board.spec.items.filter((i) => (i.section === '1.1' && ['flow', 'requirement', 'oversight'].includes(i.type)) || (i.section === '3.2' && i.type === 'system'));
}

/** The building blocks that serve an item, and the decisions that answer it. */
export function servedBy(board: Pick<Board, 'spec' | 'components'>, id: string): string[] {
  return [
    ...board.components.filter((c) => c.serves.includes(id)).map((c) => c.name),
    ...board.spec.items.filter((i) => i.type === 'decision' && i.serves?.includes(id)).map((i) => `decision: ${i.name ?? i.id}`),
  ];
}

/** A specification item's name, or its text, short. */
export function itemName(board: Pick<Board, 'spec'>, id: string): string {
  const i = board.spec.items.find((x) => x.id === id);
  if (!i) return id;
  const text = i.name ?? i.text;
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

/** A short, readable reference to a specification item. */
export function itemRef(board: Pick<Board, 'spec'>, id: string): string {
  const i = board.spec.items.find((x) => x.id === id);
  if (!i) return id;
  const text = i.name ?? i.text;
  return `${id} (${text.length > 48 ? `${text.slice(0, 47)}…` : text})`;
}

/** The display name of a scenario participant: a person or system from 3.2, a building block or a team. */
export function participantName(board: Pick<Board, 'spec' | 'components' | 'teams'>, id: string): string {
  const item = board.spec.items.find((i) => i.id === id);
  if (item) return item.name ?? item.text;
  return board.components.find((c) => c.id === id)?.name ?? board.teams.find((t) => t.id === id)?.name ?? id;
}

/** The numbered steps of a runtime scenario, by name. */
export function scenarioSteps(board: Pick<Board, 'spec' | 'components' | 'teams'>, sc: Scenario): string[] {
  return sc.steps.map((st, n) => `${n + 1}. ${participantName(board, st.from)} → ${participantName(board, st.to)}: ${st.what}`);
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const source = (i: SpecItem, docs: Record<string, string>) => (i.source.quote ? `"${i.source.quote}", ${sourceLabel(i, docs)}` : sourceLabel(i, docs));

type DocBoard = Pick<Board, 'title' | 'brief' | 'spec' | 'stage' | 'components' | 'teams' | 'shape'>;

/** arc42 section 5: the building blocks with what they serve, then the coverage of every flow, requirement, rule and external system. */
function buildingBlocks(board: DocBoard): string[] {
  if (!board.components.length) return ['*No building blocks on the board yet.*', ''];
  const out = ['| Building block | Kind | Purpose | Serves |', '|---|---|---|---|'];
  for (const c of board.components) out.push(`| ${cell(c.name)} | ${KIND_LABELS[c.kind]} | ${cell(c.description)} | ${c.serves.join(', ')} |`);
  for (const t of board.teams) {
    const members = t.members.map((m) => board.components.find((c) => c.id === m)?.name ?? m).join(', ');
    out.push(`| ${cell(t.name)} | Team (${t.pattern.replace('_', ' ')}) | ${cell(t.purpose)} | ${cell(members)} |`);
  }
  const targets = traceTargets(board);
  if (targets.length) {
    out.push('', '**Traceability**', '', '| Specification item | Served by |', '|---|---|');
    for (const i of targets) {
      const by = servedBy(board, i.id);
      out.push(`| ${cell(itemRef(board, i.id))} | ${by.length ? cell(by.join(', ')) : '**not covered**'} |`);
    }
  }
  out.push('');
  return out;
}

/** arc42 section 6: one numbered scenario per user flow. */
function runtime(board: DocBoard): string[] {
  const flows = board.spec.items.filter((i) => i.type === 'flow');
  if (!flows.length) return ['*No user flows in 1.1.*', ''];
  const out: string[] = [];
  flows.forEach((flow, n) => {
    const sc = board.spec.scenarios.find((s) => s.flow === flow.id);
    out.push(`### 6.${n + 1} ${sc ? sc.title : flow.text}`, '', `*Realises ${itemRef(board, flow.id)}.*`, '');
    out.push(...(sc ? scenarioSteps(board, sc) : ['*No scenario recorded yet.*']), '');
  });
  return out;
}

/** arc42 section 9: decision records with the options weighed and their consequences. */
function decisions(s: DocSection, board: DocBoard, docs: Record<string, string>): string[] {
  const out: string[] = [];
  s.items.forEach((d, n) => {
    out.push(`### 9.${n + 1} ${d.name ?? d.text}`, '');
    if (d.topic) out.push(`- **Question:** ${DECISION_TOPICS[d.topic].label}`);
    out.push(`- **Decision:** ${d.text}`);
    if (d.options?.length) out.push(`- **Options considered:** ${d.options.map((o) => (o === d.name ? `${o} (chosen)` : o)).join(', ')}`);
    if (d.consequences) out.push(`- **Consequences:** ${d.consequences}`);
    if (d.serves?.length) out.push(`- **Answers:** ${d.serves.map((id) => itemRef(board, id)).join(', ')}`);
    out.push(`- *${source(d, docs)}*`, '');
  });
  return out;
}

function sectionMarkdown(s: DocSection, docs: Record<string, string>, board: DocBoard): string[] {
  const out: string[] = [];
  if (s.id === '5') return buildingBlocks(board);
  if (s.id === '6') return runtime(board);
  if (!s.items.length) return [`*${s.hint || 'Nothing recorded yet.'}*`, ''];
  if (s.id === '9') return decisions(s, board, docs);
  if (s.id === '4') {
    for (const i of s.items.filter((x) => x.type === 'strategy')) out.push(`- ${i.text}`, `  <br>*${source(i, docs)}*`);
    const qa = s.items.filter((x) => x.type === 'quality_approach');
    if (qa.length) {
      if (out.length) out.push('');
      out.push('| Quality goal | Approach | Source |', '|---|---|---|');
      for (const i of qa) out.push(`| ${cell((i.serves ?? []).map((id) => itemRef(board, id)).join(', '))} | ${cell(i.text)} | ${cell(source(i, docs))} |`);
    }
  } else if (s.id === '1.2') {
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
export function stageMarkdown(board: DocBoard, stage: StageId, documents: Record<string, string> = {}): string {
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
    lines.push(...sectionMarkdown(s, documents, board));
  }
  if (stage === 'solution') {
    const gaps = traceability(board);
    if (gaps.length) {
      lines.push('## Open before approval', '');
      for (const g of gaps) lines.push(`- ${g}`);
      lines.push('');
    }
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
