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
  /** The categories an item of this type must name one of, with their labels. */
  categories?: Record<string, string>;
  /** Per category, the values the item's name must be one of (a setting's options). */
  values?: Record<string, readonly string[]>;
  /** The item must serve an item in this section, e.g. a quality scenario serves a 1.2 quality goal. */
  servesSection?: string;
  /** The item states how it is measured. */
  measured?: boolean;
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
    types: [{ id: 'constraint', label: 'Constraint', placeholder: 'A limit the design must respect', categories: CONSTRAINT_CATEGORIES }],
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
  '7': 'Deployment view',
  '8': 'Crosscutting concepts',
  '9': 'Architecture decisions',
  '10': 'Quality requirements',
  '11': 'Risks and technical debt',
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
  hosting: { label: 'Agent hosting', question: 'Prompt agents run by Foundry Agent Service, hosted agents (our code in a container on Foundry Agent Service), or self-hosted orchestration on compute we operate?', guidance: BASELINE },
  other: { label: 'Other', question: '', guidance: `${DISCOVERY}#recommend-propose-the-technical-strategy` },
} as const;
export type DecisionTopic = keyof typeof DECISION_TOPICS;

/**
 * The three ways to run the agents, as the baseline Foundry architecture
 * describes them. A hosting decision names one of these exactly, because the
 * compiler reads it: prompt agents are declared in azure.yaml, hosted agents
 * are container images in a registry the team owns that Foundry Agent Service
 * runs, and self-hosted orchestration runs on compute the team operates.
 */
export const HOSTING = ['Prompt agents', 'Hosted agents', 'Self-hosted orchestration'] as const;
export type Hosting = (typeof HOSTING)[number];
export const hostingOf = (name: string | undefined): Hosting | undefined => HOSTING.find((h) => h.toLowerCase() === name?.toLowerCase());

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
      { id: 'quality_approach', label: 'Quality goal', placeholder: 'How a quality goal from 1.2 is met', servesSection: '1.2' },
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
/**
 * The deployment settings: the few choices that are hard or impossible to
 * change after deployment and that the earlier stages do not settle. The
 * compile wizard asks only these, prefilled with what technical design
 * recorded (ADR 0003).
 */
export const DEPLOYMENT_SETTINGS = {
  region: { label: 'Region', required: true, values: null },
  network_isolation: { label: 'Network isolation', required: true, values: ['Private networking', 'Public endpoints'] },
  landing_zone: { label: 'Platform landing zone', required: true, values: ['Standalone', 'Existing platform landing zone'] },
  model_capacity: { label: 'Model capacity', required: false, values: null },
} as const;
export type DeploymentSetting = keyof typeof DEPLOYMENT_SETTINGS;

/**
 * Crosscutting concepts (arc42 section 8): the rules every building block
 * follows. The baseline Foundry architecture covers identity, networking,
 * data protection, monitoring and content safety for every component; the
 * operational standards for AI agents require evaluation with acceptance
 * thresholds before production.
 */
export const CONCEPTS = {
  identity: { label: 'Identity and access', required: true },
  networking: { label: 'Networking', required: true },
  data_protection: { label: 'Data protection', required: false },
  observability: { label: 'Observability', required: true },
  content_safety: { label: 'Content safety', required: true },
  evaluation: { label: 'Evaluation', required: true },
  cost: { label: 'Cost management', required: false },
} as const;
export type Concept = keyof typeof CONCEPTS;

const label = <T extends Record<string, { label: string }>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.label])) as Record<keyof T, string>;
const BASELINE_PAGE = 'https://learn.microsoft.com/en-us/azure/architecture/ai-ml/architecture/baseline-microsoft-foundry-chat';
const OPERATIONAL = 'https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ai-agents/operational-standards';

/**
 * Stage 3 (technical design) owns arc42 sections 7, 8, 10 and 11: where the
 * system runs, the rules across it, the quality scenarios that make each
 * quality goal testable, and the risks, debt and assumptions. Alongside them,
 * the Well-Architected design review: every coded recommendation of the five
 * pillar checklists, with its status (shared/board/waf.ts).
 */
export const TECHNICAL_SECTIONS: SectionDef[] = [
  {
    id: '7',
    stage: 'technical',
    title: 'Deployment view',
    hint: 'The environments, and the settings that are hard to change after deployment. The Azure resources follow from the design.',
    types: [
      { id: 'setting', label: 'Setting', named: true, placeholder: 'Why, e.g. the data residency constraint', categories: label(DEPLOYMENT_SETTINGS), values: Object.fromEntries(Object.entries(DEPLOYMENT_SETTINGS).flatMap(([k, v]) => (v.values ? [[k, v.values]] : []))) },
      { id: 'environment', label: 'Environment', named: true, placeholder: 'What it is for, e.g. testing with production-like data' },
    ],
    guidance: [`${BASELINE_PAGE}#architecture`, `${BASELINE_PAGE}#security`, `${WAF}/architect-role/design-diagrams#deployment-diagram`],
  },
  {
    id: '8',
    stage: 'technical',
    title: 'Crosscutting concepts',
    hint: 'The rules every building block follows: identity, networking, observability, content safety, evaluation.',
    types: [{ id: 'concept', label: 'Concept', placeholder: 'The rule, e.g. every service authenticates with a managed identity', categories: label(CONCEPTS) }],
    guidance: [`${BASELINE_PAGE}#security`, `${BASELINE_PAGE}#operational-excellence`, OPERATIONAL],
  },
  {
    id: '10',
    stage: 'technical',
    title: 'Quality requirements',
    hint: 'For each quality goal in 1.2, a scenario: what happens, how the system responds, and how that is measured.',
    types: [{ id: 'quality_scenario', label: 'Scenario', placeholder: 'When this happens, the system responds like this', servesSection: '1.2', measured: true }],
    guidance: [`${WAF}/architect-role/architecture-design-specification`, OPERATIONAL],
  },
  {
    id: '11',
    stage: 'technical',
    title: 'Risks and technical debt',
    hint: 'What could go wrong, what is knowingly left for later, and every assumption the design rests on.',
    types: [
      { id: 'risk', label: 'Risk', placeholder: 'What could go wrong, and the mitigation' },
      { id: 'debt', label: 'Debt', placeholder: 'What is left for later, and why' },
      { id: 'assumption', label: 'Assumption', placeholder: 'What the design assumes until it is confirmed', categories: { general: 'General', out_of_scope: 'Out of scope', reliability: 'Reliability', performance: 'Performance', cost: 'Cost', operations: 'Operations', rollout: 'Rollout' } },
    ],
    guidance: [`${WAF}/architect-role/architecture-design-specification`, `${WAF}/reliability/failure-mode-analysis`],
  },
];

/** Every arc42 section Teolima uses, in arc42 order. */
export const SECTIONS: SectionDef[] = [...DISCOVERY_SECTIONS, ...SOLUTION_SECTIONS, ...TECHNICAL_SECTIONS].sort((a, b) => parseFloat(a.id) - parseFloat(b.id));

export const sectionDef = (id: string): SectionDef | undefined => SECTIONS.find((s) => s.id === id);
export const sectionsOf = (stage: StageId): SectionDef[] => SECTIONS.filter((s) => s.stage === stage);
export const typeDef = (section: string, type: string): ItemType | undefined => sectionDef(section)?.types.find((t) => t.id === type);
