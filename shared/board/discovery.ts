/**
 * Discovery: what the functional specification must hold before design starts.
 *
 * Microsoft's architect guidance ("Align technical strategy with business
 * requirements") ends discovery with a functional specification that defines
 * what the workload must achieve and why: business problems with measurable
 * outcomes, what is in and out of scope, metrics and success criteria, user
 * flows with their errors and exceptions, requirements for accessibility,
 * compliance, performance, privacy and security, and a rollout strategy. It
 * also warns that implicit requirements such as data residency, security
 * standards and retention are easily missed and must be documented early.
 *
 * Each topic below is covered when the stage 1 document (shared/board/arc42.ts)
 * holds an item of the right kind. Required topics must be covered before the
 * user can approve discovery; the others stay open and are confirmed in the
 * technical design. Every topic names the guidance it rests on.
 */
import { QUALITY_ATTRIBUTES } from './arc42';
import type { Board, SpecItem } from './schema';

const WAF = 'https://learn.microsoft.com/en-us/azure/well-architected';
const DISCOVERY = `${WAF}/architect-role/design-business-requirements`;
const C4_CONTEXT = `${WAF}/architect-role/design-diagrams#context-diagram`;

export interface Topic {
  id: string;
  title: string;
  /** What the coach asks when the topic is not covered. */
  question: string;
  required: boolean;
  covers: (item: SpecItem) => boolean;
  /** Where the answer is recorded: arc42 section and item type. */
  records: string;
  /** The guidance this topic rests on: section URLs in the guidance snapshot. */
  guidance: string[];
}

const is = (section: string, ...types: string[]) => (i: SpecItem) => i.section === section && types.includes(i.type);
const quality = (...pillars: string[]) => (i: SpecItem) =>
  i.section === '1.2' && !!i.attribute && pillars.includes(QUALITY_ATTRIBUTES[i.attribute].pillar ?? '');

export const TOPICS: Topic[] = [
  {
    id: 'goals',
    title: 'Goals',
    question: 'What business outcome should this achieve, and why does it matter now?',
    required: true,
    covers: is('1.1', 'goal'),
    records: '1.1 Goal',
    guidance: [`${DISCOVERY}#probe-understand-the-motivation`],
  },
  {
    id: 'metrics',
    title: 'Success metrics',
    question: 'How will you measure that it works? What number tells you it succeeded?',
    required: true,
    covers: is('1.1', 'metric'),
    records: '1.1 Success metric',
    guidance: [`${DISCOVERY}#expected-outcome`],
  },
  {
    id: 'flows',
    title: 'User flows',
    question: 'Walk me through what a user does, start to finish. What should happen when something goes wrong?',
    required: true,
    covers: is('1.1', 'flow'),
    records: '1.1 User flow',
    guidance: [`${DISCOVERY}#expected-outcome`],
  },
  {
    id: 'oversight',
    title: 'Human oversight',
    question: 'Which actions must a person approve, and what must it never do on its own?',
    required: true,
    covers: is('1.1', 'oversight'),
    records: '1.1 Needs a person',
    guidance: ['https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns#human-participation'],
  },
  {
    id: 'security',
    title: 'Security, privacy and compliance',
    question: 'Which data is sensitive, who may see it, where must it stay, how long may it be kept, and which rules apply?',
    required: true,
    covers: (i) => quality('security')(i) || (i.section === '2' && i.category === 'regulatory'),
    records: '1.2 Quality goal (security, privacy, compliance) or 2 Constraint (regulatory)',
    guidance: [`${DISCOVERY}#clarify-translate-requests-to-requirements`, `${WAF}/security/checklist`],
  },
  {
    id: 'stakeholders',
    title: 'Stakeholders',
    question: 'Who has a stake in this, and what does each of them expect?',
    required: true,
    covers: is('1.3', 'stakeholder'),
    records: '1.3 Stakeholder',
    guidance: [`${DISCOVERY}#listen-capture-stakeholder-requests`],
  },
  {
    id: 'scope',
    title: 'Scope',
    question: 'What does it cover in its first version?',
    required: true,
    covers: is('3.1', 'in_scope'),
    records: '3.1 In scope',
    guidance: [`${DISCOVERY}#expected-outcome`],
  },
  {
    id: 'people',
    title: 'People around it',
    question: 'Who uses it directly, and what do they do with it?',
    required: true,
    covers: is('3.2', 'person'),
    records: '3.2 Person',
    guidance: [C4_CONTEXT],
  },
  {
    id: 'systems',
    title: 'Systems around it',
    question: 'Which systems and data does it read from or change, and what is exchanged with each?',
    required: true,
    covers: is('3.2', 'system'),
    records: '3.2 External system',
    guidance: [C4_CONTEXT],
  },
  {
    id: 'out_of_scope',
    title: 'Out of scope',
    question: 'What is explicitly not part of it?',
    required: false,
    covers: is('3.1', 'out_of_scope'),
    records: '3.1 Out of scope',
    guidance: [`${DISCOVERY}#expected-outcome`],
  },
  {
    id: 'reliability',
    title: 'Reliability',
    question: 'Which flows must always be available, and which may degrade for a while?',
    required: false,
    covers: quality('reliability'),
    records: '1.2 Quality goal (reliability)',
    guidance: [`${DISCOVERY}#clarify-translate-requests-to-requirements`, `${WAF}/reliability/checklist`],
  },
  {
    id: 'performance',
    title: 'Performance',
    question: 'How quickly must it respond, and how much work will it handle at peak?',
    required: false,
    covers: quality('performance-efficiency'),
    records: '1.2 Quality goal (performance)',
    guidance: [`${WAF}/performance-efficiency/checklist`],
  },
  {
    id: 'cost',
    title: 'Cost',
    question: 'Is there a budget or a cost limit it must stay within?',
    required: false,
    covers: (i) => quality('cost-optimization')(i) || (i.section === '2' && i.category === 'business'),
    records: '1.2 Quality goal (cost) or 2 Constraint (budget or timeline)',
    guidance: [`${WAF}/cost-optimization/checklist`],
  },
  {
    id: 'operations',
    title: 'Operations',
    question: 'Who will run and support it once it is live?',
    required: false,
    covers: quality('operational-excellence'),
    records: '1.2 Quality goal (operations)',
    guidance: [`${WAF}/operational-excellence/checklist`],
  },
  {
    id: 'rollout',
    title: 'Rollout',
    question: 'How should it be introduced: everyone at once, or one group first?',
    required: false,
    covers: is('3.1', 'rollout'),
    records: '3.1 Rollout',
    guidance: [`${DISCOVERY}#expected-outcome`],
  },
];

export interface TopicStatus {
  topic: Topic;
  covered: boolean;
  /** Ids of the items that cover it. */
  by: string[];
}

export interface Discovery {
  topics: TopicStatus[];
  /** Required topics not yet covered, in order. */
  missing: Topic[];
  /** Optional topics not yet covered: confirmed later in the technical design. */
  open: Topic[];
  done: boolean;
}

export function discovery(board: Pick<Board, 'spec'>): Discovery {
  const items = board.spec.items;
  const topics = TOPICS.map((topic) => {
    const by = items.filter(topic.covers).map((i) => i.id);
    return { topic, covered: by.length > 0, by };
  });
  const missing = topics.filter((t) => t.topic.required && !t.covered).map((t) => t.topic);
  const open = topics.filter((t) => !t.topic.required && !t.covered).map((t) => t.topic);
  return { topics, missing, open, done: missing.length === 0 };
}

/** The refusal given when design starts before discovery is done. */
export function discoveryRefusal(d: Discovery): string {
  return (
    'Discovery is not done. Record the answers with record_item before designing. Still missing: ' +
    d.missing.map((t) => `${t.title} ("${t.question}", recorded as ${t.records})`).join('; ') +
    '.'
  );
}
