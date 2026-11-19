/**
 * A Microsoft reference architecture, specified the way an architect would
 * specify it in Teolima: "Multiple-agent workflow automation" in the Azure
 * Architecture Center, applied to its own worked use case, legacy SQL query
 * translation. Everything comes from the published page (in the guidance
 * snapshot), quoted, except what the page leaves to the client: an approval
 * rule, and a measurable target. Those come from the client in the session.
 *
 * The page decides: Microsoft Foundry with GPT-4.1, specialised agents for
 * analysis, translation, validation and documentation, a dependent workflow,
 * custom Agent Framework code hosted in Container Apps, and Azure Cosmos DB
 * for plans, history and agent decisions.
 */
import { readFileSync } from 'node:fs';
import type { Basis, Change, ChangeBody } from '../../shared/board/changes';

export const REFERENCE_URL = 'https://learn.microsoft.com/en-us/azure/architecture/ai-ml/idea/multiple-agent-workflow-automation';
export const REFERENCE_DOC = 'ref-1';

/** The page's text, from the guidance snapshot. */
export function referenceText(): string {
  const snap = JSON.parse(readFileSync('data/knowledge/architecture-center-ai.json', 'utf8')) as { pages: { url: string; sections: { text?: string }[] }[] };
  const page = snap.pages.find((p) => p.url === REFERENCE_URL);
  if (!page) throw new Error(`${REFERENCE_URL} is not in the snapshot`);
  return page.sections.map((s) => s.text ?? '').join('\n');
}

/** What the client says in the session, for what the page leaves open. */
export const CLIENT_WORDS = [
  'A person reviews every translated query before it runs against the target database.',
  'Nine out of ten translated queries should pass validation without changes.',
];

const at = '2026-11-19T15:00:00.000Z';
const page = (quote: string): Basis => ({ source: 'document', document: REFERENCE_DOC, quote });
const client = (quote: string): Basis => ({ source: 'user', quote });
const c = (body: ChangeBody, basis?: Basis, actor: Change['actor'] = 'coach'): Change => ({ body, actor, reason: 'From the reference architecture', at, ...(basis ? { basis } : {}) });
type Item = Omit<Extract<ChangeBody, { op: 'record_item' }>, 'op'>;
const item = (fields: Item, basis: Basis) => c({ op: 'record_item', ...fields }, basis);
const decide = (topic: 'platform' | 'complexity' | 'pattern' | 'hosting', name: string, text: string, options: string[], consequences: string, quote: string) =>
  item({ section: '9', type: 'decision', topic, name, text, options, consequences }, page(quote));
const add = (body: Omit<Extract<ChangeBody, { op: 'upsert_component' }>, 'op'>) => c({ op: 'upsert_component', ...body });

export const referenceDiscovery: Change[] = [
  c({ op: 'set_brief', goal: 'Translate legacy SQL queries between database dialects with specialised AI agents', audience: 'Employees who migrate databases', constraints: [] }, undefined, 'user'),
  c({ op: 'set_title', title: 'SQL query modernization' }, undefined, 'user'),
  item({ section: '1.1', type: 'goal', text: 'Translate SQL queries between database dialects and keep their business logic and performance' }, page('translate SQL queries across different database dialects while you preserve business logic and performance characteristics')),
  item({ section: '1.1', type: 'metric', text: 'Nine out of ten translated queries pass validation without changes' }, client('Nine out of ten translated queries should pass validation')),
  item({ section: '1.1', type: 'flow', text: 'An employee submits queries to translate and gets the translations, a validation report and migration notes' }, page('They submit tasks that have specific requirements and parameters through the web interface')),
  item({ section: '1.1', type: 'oversight', text: 'A person reviews every translated query before it runs against the target database' }, client('A person reviews every translated query before it runs against the target database')),
  item({ section: '1.1', type: 'requirement', text: 'Plans, past solutions and agent decisions are kept for later reference' }, page('persists agent decisions and outcomes for future reference')),
  item({ section: '2', type: 'constraint', category: 'regulatory', text: 'Every task keeps an audit trail to support compliance' }, page('require audit trails to support compliance')),
  item({ section: '1.3', type: 'stakeholder', name: 'Software team', text: 'Develops and maintains the agents with Agent Framework' }, page('the custom code that your software team develops by using Agent Framework')),
  item({ section: '3.1', type: 'in_scope', text: 'Legacy SQL query translation' }, page('Legacy SQL query translation')),
  item({ section: '3.2', type: 'person', name: 'Employee', text: 'Submits translation tasks and reviews the results' }, page('Employees access the web front end to request and manage automated solutions')),
  item({ section: '3.2', type: 'system', name: 'Source database', text: 'The legacy queries and their dialect' }, page('migrate from platforms like Oracle to Azure SQL Database')),
  item({ section: '3.2', type: 'system', name: 'Target database', text: 'Runs the translated queries for validation' }, page('migrate from platforms like Oracle to Azure SQL Database')),
  c({ op: 'approve_stage', stage: 'discovery', by: 'Business sponsor' }, undefined, 'user'),
];

export const referenceSolution: Change[] = [
  decide('platform', 'Microsoft Foundry', 'Build the agents on Microsoft Foundry with a GPT-4.1 model', ['SaaS agents', 'Copilot Studio', 'Microsoft Foundry'], 'Foundry provides the models and Foundry Tools; the software team owns the agents.', 'connects to a Microsoft Foundry-hosted GPT-4.1 model'),
  decide('complexity', 'Several agents', 'Four specialised agents: analysis, translation, validation and documentation', ['One agent with tools', 'Several agents'], 'Each agent applies its own expertise; more agents to evaluate and monitor.', 'tasks that span multiple areas of expertise'),
  decide('pattern', 'Sequential', 'Each agent builds on the previous one: analyse, translate, validate, document', ['Sequential', 'Concurrent', 'Handoff', 'Group chat'], 'A fixed order, easy to audit; no step runs in parallel.', 'Sequential patterns suit dependent tasks'),
  decide('hosting', 'Hosted agents', 'Custom Agent Framework code, hosted in Azure Container Apps', ['Prompt agents', 'Hosted agents'], 'Deterministic orchestration and control of compute; the team builds and runs the orchestration code.', 'This code-first solution provides maximum control over agent behavior, orchestration logic, and compute scale'),
  c({ op: 'set_shape', shape: 'multi', reasons: ['prompt_complexity'] }, page('tasks that span multiple areas of expertise')),
  add({ kind: 'trigger', name: 'Web front end', source: 'api', description: 'App Service website', serves: ['person-1'] }),
  add({ kind: 'tool', name: 'Source schema', toolType: 'function', description: 'Reads queries and dialect from the source', serves: ['system-1'] }),
  add({ kind: 'tool', name: 'Target database', toolType: 'function', description: 'Runs queries on the target', serves: ['system-2'] }),
  add({ kind: 'memory', name: 'Task history', scope: 'user', store: 'cosmos_db', description: 'Plans, solutions and decisions', serves: ['requirement-1'] }),
  add({ kind: 'agent', name: 'SQL analysis', model: 'gpt-4.1', description: 'Finds dialect-specific constructs', tools: ['Source schema'], memory: ['Task history'], serves: ['flow-1', 'goal-1'] }),
  add({ kind: 'agent', name: 'Translation', model: 'gpt-4.1', description: 'Converts syntax to the target', serves: ['flow-1', 'goal-1'] }),
  add({ kind: 'agent', name: 'Validation', model: 'gpt-4.1', description: 'Tests query equivalence', tools: ['Target database'], serves: ['flow-1', 'metric-1'] }),
  add({ kind: 'agent', name: 'Documentation', model: 'gpt-4.1', description: 'Writes migration notes', serves: ['flow-1'] }),
  c({ op: 'upsert_team', name: 'Migration', pattern: 'sequential', members: ['SQL analysis', 'Translation', 'Validation', 'Documentation'], purpose: 'Translate, validate and document' }),
  add({ kind: 'approval', name: 'Query review', gates: 'Target database', condition: 'Before a translated query runs', serves: ['oversight-1'] }),
  add({ kind: 'guardrail', name: 'Content safety', controls: ['prompt_shields', 'harm_filters'] }),
  add({ kind: 'output', name: 'Results', destination: 'storage', description: 'Translations, report and notes' }),
  c({ op: 'connect', from: 'Web front end', to: 'Migration', label: 'task' }),
  c({ op: 'connect', from: 'Migration', to: 'Results', label: 'results' }),
  c(
    {
      op: 'set_scenario',
      flow: 'flow-1',
      title: 'Employee translates a query',
      steps: [
        { from: 'Employee', to: 'Web front end', what: 'submits a query' },
        { from: 'Web front end', to: 'SQL analysis', what: 'starts the task' },
        { from: 'SQL analysis', to: 'Source schema', what: 'reads the dialect' },
        { from: 'SQL analysis', to: 'Translation', what: 'passes the analysis' },
        { from: 'Translation', to: 'Validation', what: 'passes the translation' },
        { from: 'Validation', to: 'Query review', what: 'asks a person' },
        { from: 'Query review', to: 'Target database', what: 'approved: runs the test' },
        { from: 'Validation', to: 'Documentation', what: 'passes the report' },
        { from: 'Documentation', to: 'Results', what: 'writes migration notes' },
      ],
    },
    page('Agents collaborate to plan, perform, and validate the required tasks'),
  ),
  item({ section: '4', type: 'strategy', text: 'A sequential team of four specialised agents in custom Agent Framework code, on Microsoft Foundry' }, page('Custom software that uses Microsoft Agent Framework defines the agent and orchestration behavior')),
];
