/**
 * Discovery: what an architect must know before designing.
 *
 * Microsoft's architect guidance puts the functional specification first:
 * the what and the why of the system, the current problem and how the system
 * improves it, and the business requirements, before any design. The design
 * must then meet functional and nonfunctional requirements and be constrained
 * by business, financial, compliance and organisational requirements.
 *
 * Each topic below is covered when the specification holds a requirement of
 * the right kind (and pillar). Required topics must be covered before
 * anything is designed; the others are asked about and, if left open, become
 * assumptions to confirm in the design specification. Every topic names the
 * guidance it rests on, so the coach and a reviewer can open it.
 */
import type { Board, Pillar, Requirement, RequirementKind } from './schema';

const WAF = 'https://learn.microsoft.com/en-us/azure/well-architected';

export interface Topic {
  id: string;
  title: string;
  /** What the coach asks when the topic is not covered. */
  question: string;
  required: boolean;
  covers: (r: Requirement) => boolean;
  /** The guidance this topic rests on: section URLs in the guidance snapshot. */
  guidance: string[];
}

const kind = (...kinds: RequirementKind[]) => (r: Requirement) => kinds.includes(r.kind);
const pillar = (p: Pillar) => (r: Requirement) => (r.kind === 'nonfunctional' || r.kind === 'constraint') && r.pillar === p;

const SPEC = `${WAF}/architect-role/architecture-design-specification#functional-specification`;
const CHECKLIST = `${WAF}/architect-role/checklist`;

export const TOPICS: Topic[] = [
  {
    id: 'problem',
    title: 'Problem',
    question: 'What problem does this solve today, and for whom?',
    required: true,
    covers: kind('problem'),
    guidance: [SPEC],
  },
  {
    id: 'outcome',
    title: 'Outcome',
    question: 'What should it achieve, and how will you know it works?',
    required: true,
    covers: kind('outcome'),
    guidance: [SPEC],
  },
  {
    id: 'users',
    title: 'Users',
    question: 'Who uses it, and who else is affected by what it does?',
    required: true,
    covers: kind('user'),
    guidance: [SPEC],
  },
  {
    id: 'scenarios',
    title: 'Scenarios',
    question: 'What is the main thing a user does with it, from start to finish?',
    required: true,
    covers: kind('scenario', 'functional'),
    guidance: [SPEC],
  },
  {
    id: 'systems',
    title: 'Systems and data',
    question: 'Which systems and data does it read from or change?',
    required: true,
    covers: kind('integration'),
    guidance: [SPEC],
  },
  {
    id: 'oversight',
    title: 'Human oversight',
    question: 'Which actions must a person approve, and what must it never do on its own?',
    required: true,
    covers: kind('oversight'),
    guidance: [CHECKLIST],
  },
  {
    id: 'security',
    title: 'Security and compliance',
    question: 'Who may use it, which data is sensitive, and where must data stay?',
    required: true,
    covers: pillar('security'),
    guidance: [`${WAF}/security/checklist`],
  },
  {
    id: 'reliability',
    title: 'Reliability',
    question: 'How available must it be, and what should happen when it is down?',
    required: false,
    covers: pillar('reliability'),
    guidance: [`${WAF}/reliability/checklist`],
  },
  {
    id: 'cost',
    title: 'Cost',
    question: 'Is there a budget or a cost limit it must stay within?',
    required: false,
    covers: pillar('cost-optimization'),
    guidance: [`${WAF}/cost-optimization/checklist`],
  },
  {
    id: 'operations',
    title: 'Operations',
    question: 'Who will run and monitor it, and how is it released and changed?',
    required: false,
    covers: pillar('operational-excellence'),
    guidance: [`${WAF}/operational-excellence/checklist`],
  },
  {
    id: 'performance',
    title: 'Performance',
    question: 'How quickly must it respond, and how much work will it handle?',
    required: false,
    covers: pillar('performance-efficiency'),
    guidance: [`${WAF}/performance-efficiency/checklist`],
  },
];

export interface TopicStatus {
  topic: Topic;
  covered: boolean;
  /** Ids of the requirements that cover it. */
  by: string[];
}

export interface Discovery {
  topics: TopicStatus[];
  /** Required topics not yet covered, in order. */
  missing: Topic[];
  /** Optional topics not yet covered: assumptions to confirm later. */
  open: Topic[];
  done: boolean;
}

export function discovery(board: Pick<Board, 'spec'>): Discovery {
  const reqs = board.spec.requirements;
  const topics = TOPICS.map((topic) => {
    const by = reqs.filter(topic.covers).map((r) => r.id);
    return { topic, covered: by.length > 0, by };
  });
  const missing = topics.filter((t) => t.topic.required && !t.covered).map((t) => t.topic);
  const open = topics.filter((t) => !t.topic.required && !t.covered).map((t) => t.topic);
  return { topics, missing, open, done: missing.length === 0 };
}

/** The refusal given when design starts before discovery is done. */
export function discoveryRefusal(d: Discovery): string {
  return (
    `Discovery is not done. Record the user's requirements with record_requirement before designing. Still missing: ` +
    d.missing.map((t) => `${t.title} ("${t.question}")`).join('; ') +
    '.'
  );
}
