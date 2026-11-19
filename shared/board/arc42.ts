/**
 * The stage documents, structured as arc42 and filled in as Microsoft's
 * architect guidance describes.
 *
 * arc42 (arc42.org) is the open template many architects use for
 * architecture documentation: twelve numbered sections from introduction and
 * goals to risks and glossary. Teolima uses its numbering and titles, and
 * assigns each section to the stage whose audience owns it. The content of
 * each section follows Microsoft's guidance, cited per section, so a reviewer
 * can open the source.
 *
 * Stage 1 (discovery) owns arc42 sections 1 to 3. Its content is the
 * functional specification that Microsoft's "Align technical strategy with
 * business requirements" names as the expected outcome of discovery: what is
 * in and out of scope, measurable success criteria, user flows with their
 * exceptions, requirements for accessibility, compliance, performance,
 * privacy and security (including implicit ones such as data residency and
 * retention), and the rollout. The business context feeds the C4 system
 * context diagram.
 */
import type { StageId } from './schema';

const WAF = 'https://learn.microsoft.com/en-us/azure/well-architected';
const DISCOVERY = `${WAF}/architect-role/design-business-requirements`;
export const ARC42 = 'https://docs.arc42.org/home/';

export interface ItemType {
  id: string;
  /** Shown as a small label next to the item. */
  label: string;
  /** A short name is required (a role, a system), shown on diagrams and in tables. */
  named?: boolean;
  /** Placeholder text for the item's sentence. */
  placeholder: string;
}

export interface SectionDef {
  /** arc42 numbering, e.g. "1.1". */
  id: string;
  stage: StageId;
  title: string;
  /** What belongs here, in one sentence: shown when the section is empty. */
  hint: string;
  types: ItemType[];
  /** Sources for what this section must contain. */
  guidance: string[];
}

/** Quality attributes a quality goal can name, and the Well-Architected pillar each belongs to. */
export const QUALITY_ATTRIBUTES = {
  reliability: { label: 'Reliability', pillar: 'reliability' },
  security: { label: 'Security', pillar: 'security' },
  privacy: { label: 'Privacy', pillar: 'security' },
  compliance: { label: 'Compliance', pillar: 'security' },
  performance: { label: 'Performance', pillar: 'performance-efficiency' },
  cost: { label: 'Cost', pillar: 'cost-optimization' },
  operations: { label: 'Operations', pillar: 'operational-excellence' },
  accessibility: { label: 'Accessibility', pillar: null },
} as const;
export type QualityAttribute = keyof typeof QUALITY_ATTRIBUTES;

/** Constraint categories, from arc42 (technical, organizational, conventions) and Microsoft's discovery guidance (budgets, timelines, compliance rules). */
export const CONSTRAINT_CATEGORIES = {
  business: 'Budget or timeline',
  regulatory: 'Regulatory',
  technical: 'Technical',
  organizational: 'Organizational',
} as const;
export type ConstraintCategory = keyof typeof CONSTRAINT_CATEGORIES;

/** Stage 1 (discovery): arc42 sections 1 to 3. */
export const DISCOVERY_SECTIONS: SectionDef[] = [
  {
    id: '1.1',
    stage: 'discovery',
    title: 'Requirements overview',
    hint: 'Why this system is needed, what success looks like in numbers, and the user flows it must support, including what happens when something goes wrong.',
    types: [
      { id: 'goal', label: 'Goal', placeholder: 'A business outcome and why it matters' },
      { id: 'metric', label: 'Success metric', placeholder: 'How success is measured, e.g. 70% of order questions answered without a person' },
      { id: 'flow', label: 'User flow', placeholder: 'What a user does, start to finish, and how errors are handled' },
      { id: 'requirement', label: 'Requirement', placeholder: 'Something the system must do' },
      { id: 'oversight', label: 'Needs a person', placeholder: 'An action a person must approve, or something it must never do on its own' },
      { id: 'assumption', label: 'Assumption', placeholder: 'Something stated as a need that still has to be verified' },
    ],
    guidance: [`${DISCOVERY}#expected-outcome`, `${DISCOVERY}#probe-understand-the-motivation`, 'https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns#human-participation'],
  },
  {
    id: '1.2',
    stage: 'discovery',
    title: 'Quality goals',
    hint: 'The few qualities that matter most, made measurable: availability per flow, response time, data residency and retention, privacy, accessibility, cost.',
    types: [{ id: 'quality', label: 'Quality goal', placeholder: 'A measurable quality, e.g. order placement available 99.9% of the time' }],
    guidance: [`${DISCOVERY}#clarify-translate-requests-to-requirements`, `${WAF}/reliability/checklist`, `${WAF}/security/checklist`, `${WAF}/performance-efficiency/checklist`, `${WAF}/cost-optimization/checklist`, `${WAF}/operational-excellence/checklist`],
  },
  {
    id: '1.3',
    stage: 'discovery',
    title: 'Stakeholders',
    hint: 'Who has a stake in the system and what each expects from it.',
    types: [{ id: 'stakeholder', label: 'Stakeholder', named: true, placeholder: 'What this role expects from the system' }],
    guidance: [`${DISCOVERY}#listen-capture-stakeholder-requests`],
  },
  {
    id: '2',
    stage: 'discovery',
    title: 'Constraints',
    hint: 'Limits the design must respect: budget and timeline, regulation, required technology, organizational rules.',
    types: [{ id: 'constraint', label: 'Constraint', placeholder: 'A limit the design must respect' }],
    guidance: [`${DISCOVERY}#evaluate-test-feasibility-constraints-and-trade-offs`],
  },
  {
    id: '3.1',
    stage: 'discovery',
    title: 'Scope',
    hint: 'What is in scope, what is explicitly out, and how it rolls out.',
    types: [
      { id: 'in_scope', label: 'In scope', placeholder: 'Something this system covers' },
      { id: 'out_of_scope', label: 'Out of scope', placeholder: 'Something it explicitly does not cover' },
      { id: 'rollout', label: 'Rollout', placeholder: 'How it is introduced, e.g. first to one team, then to all' },
    ],
    guidance: [`${DISCOVERY}#expected-outcome`],
  },
  {
    id: '3.2',
    stage: 'discovery',
    title: 'Business context',
    hint: 'The people and systems around it, and what each exchanges with it. This draws the system context diagram.',
    types: [
      { id: 'person', label: 'Person', named: true, placeholder: 'What this person does with the system' },
      { id: 'system', label: 'External system', named: true, placeholder: 'What the system exchanges with it' },
    ],
    guidance: [`${WAF}/architect-role/design-diagrams#context-diagram`],
  },
];

/** Groups of sections with their arc42 chapter titles, for headings. */
export const CHAPTERS: Record<string, string> = {
  '1': 'Introduction and goals',
  '2': 'Constraints',
  '3': 'Context and scope',
  '4': 'Solution strategy',
  '5': 'Building block view',
  '6': 'Runtime view',
  '9': 'Architecture decisions',
};

const PATTERNS = 'https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns';
const CAF_TREE = 'https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ai-agents#ai-agent-decision-tree-and-architecture';
const BASELINE = 'https://learn.microsoft.com/en-us/azure/architecture/ai-ml/architecture/baseline-microsoft-foundry-chat#alternatives';

/**
 * What a decision record decides. The first ones are required before solution
 * design can be approved; Microsoft's guidance names the question for each.
 */
export const DECISION_TOPICS = {
  platform: { label: 'Platform', question: 'Do SaaS agents meet the need, or do we build, and on which platform?', guidance: CAF_TREE },
  complexity: { label: 'Level of complexity', question: 'Direct model call, one agent with tools, or several agents?', guidance: `${PATTERNS}#start-with-the-right-level-of-complexity` },
  pattern: { label: 'Orchestration pattern', question: 'Which orchestration pattern, and why not a simpler one?', guidance: `${PATTERNS}#choose-a-pattern` },
  hosting: { label: 'Agent hosting', question: 'Prompt agents run by Foundry Agent Service, or hosted agents with our own code?', guidance: BASELINE },
  other: { label: 'Other', question: '', guidance: `${DISCOVERY}#recommend-propose-the-technical-strategy` },
} as const;
export type DecisionTopic = keyof typeof DECISION_TOPICS;

/**
 * Stage 2 (solution design) owns arc42 sections 4, 5, 6 and 9: the
 * recommendation that closes Microsoft's discovery process, the building
 * blocks (the agents, tools, knowledge, memory and controls on the board),
 * one runtime scenario per user flow, and the decisions with the options
 * that were weighed. Section 5 is the board itself, so it holds no items.
 */
export const SOLUTION_SECTIONS: SectionDef[] = [
  {
    id: '4',
    stage: 'solution',
    title: 'Solution strategy',
    hint: 'The recommendation in a few lines: the approach, and how each top quality goal is met.',
    types: [
      { id: 'strategy', label: 'Approach', placeholder: 'A fundamental choice, e.g. one agent with tools in Microsoft Foundry' },
      { id: 'quality_approach', label: 'Quality goal', placeholder: 'How a quality goal from 1.2 is met' },
    ],
    guidance: [`${DISCOVERY}#recommend-propose-the-technical-strategy`, `${PATTERNS}#start-with-the-right-level-of-complexity`],
  },
  {
    id: '5',
    stage: 'solution',
    title: 'Building block view',
    hint: 'The agents, tools, knowledge, memory and controls on the board, each with what it is for and which requirements it serves.',
    types: [],
    guidance: [`${WAF}/architect-role/design-diagrams#high-level-system-or-container-diagram`],
  },
  {
    id: '6',
    stage: 'solution',
    title: 'Runtime view',
    hint: 'For each user flow in 1.1, the numbered steps through the building blocks, including approvals and what happens on failure.',
    types: [],
    guidance: [`${WAF}/architect-role/design-diagrams#sequence-diagram`, `${PATTERNS}#human-participation`],
  },
  {
    id: '9',
    stage: 'solution',
    title: 'Architecture decisions',
    hint: 'Each significant decision: the question, the options weighed, the choice and its consequences.',
    types: [{ id: 'decision', label: 'Decision', named: true, placeholder: 'What was decided' }],
    guidance: [`${DISCOVERY}#recommend-propose-the-technical-strategy`, CAF_TREE, BASELINE],
  },
];
/** Every arc42 section Teolima uses, in arc42 order. */
export const SECTIONS: SectionDef[] = [...DISCOVERY_SECTIONS, ...SOLUTION_SECTIONS];

export const sectionDef = (id: string): SectionDef | undefined => SECTIONS.find((s) => s.id === id);
export const sectionsOf = (stage: StageId): SectionDef[] => SECTIONS.filter((s) => s.stage === stage);
export const typeDef = (section: string, type: string): ItemType | undefined => sectionDef(section)?.types.find((t) => t.id === type);
