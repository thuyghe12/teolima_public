/**
 * Designs approved through technical design, ready to compile: the support
 * desk (a handoff team on hosted agents) and Microsoft's multiple-agent
 * workflow automation (a sequential team, self-hosted in Container Apps).
 */
import { replay, type Change, type ChangeBody } from '../../shared/board/changes';
import { discovery } from '../../shared/board/discovery';
import { emptyBoard, type Board } from '../../shared/board/schema';
import { CHECKLIST } from '../../shared/board/waf';
import type { CompileAnswers } from '../../shared/compile/wizard';
import { approveSolution, supportChanges, technicalRecords } from './support-board';
import { referenceDiscovery, referenceSolution } from './reference-workflow-automation';

const at = '2026-11-19T17:00:00.000Z';
const said = (quote: string) => ({ source: 'user' as const, quote });
const c = (body: ChangeBody, actor: Change['actor'] = 'coach', quote = 'agreed in technical design'): Change => ({ body, actor, reason: 'Technical design', at, ...(actor === 'coach' ? { basis: said(quote) } : {}) });
const approve = (stage: 'solution' | 'technical', by: string): Change => ({ body: { op: 'approve_stage', stage, by }, actor: 'user', reason: 'Approved in the app', at });

export const supportCompiled = (): Board => replay(emptyBoard(), [...supportChanges, approveSolution, ...technicalRecords, approve('technical', 'Security lead')]);

export const supportAnswers: CompileAnswers = {
  agentModels: {},
  models: { 'gpt-4.1': { version: '2025-04-14', sku: 'GlobalStandard', capacity: 50 } },
};

/** The support agents have no model on the board, so the wizard asks: every agent gets gpt-4.1. */
export function supportAnswersFor(board: Board): CompileAnswers {
  return { ...supportAnswers, agentModels: Object.fromEntries(board.components.filter((a) => a.kind === 'agent').map((a) => [a.id, 'gpt-4.1'])) };
}

export function referenceCompiled(): Board {
  const solved = replay(emptyBoard(), [...referenceDiscovery, ...referenceSolution, approve('solution', 'Architect')]);
  const records: Change[] = [
    c({ op: 'record_item', section: '7', type: 'setting', category: 'region', name: 'West Europe', text: 'Close to the team' }),
    c({ op: 'record_item', section: '7', type: 'setting', category: 'network_isolation', name: 'Private networking', text: 'Source code and data stay private' }),
    c({ op: 'record_item', section: '7', type: 'setting', category: 'landing_zone', name: 'Standalone', text: 'A dedicated migration subscription' }),
    ...(['identity', 'networking', 'observability', 'content_safety', 'evaluation'] as const).map((k) => c({ op: 'record_item', section: '8', type: 'concept', category: k, text: `The ${k.replace('_', ' ')} rule for every block` })),
    ...discovery(solved).open.map((t) => c({ op: 'record_item', section: '11', type: 'assumption', category: t.id, text: `Assumed for ${t.title.toLowerCase()} until confirmed` })),
    c({ op: 'review', checks: CHECKLIST.map((r) => ({ code: r.code, status: 'met' as const })) }),
  ];
  return replay(solved, [...records, approve('technical', 'Platform lead')]);
}

export const referenceAnswers: CompileAnswers = { models: { 'gpt-4.1': { version: '2025-04-14', sku: 'GlobalStandard', capacity: 100 } } };

/** One agent with tools, on prompt agents: the default the guidance recommends. */
export function promptAgentCompiled(): Board {
  const d = (topic: 'platform' | 'complexity' | 'hosting', name: string, options: string[]) =>
    c({ op: 'record_item', section: '9', type: 'decision', topic, name, text: name, options });
  const solution: Change[] = [
    d('platform', 'Microsoft Foundry', ['Copilot Studio', 'Microsoft Foundry']),
    d('complexity', 'One agent with tools', ['One agent with tools', 'Several agents']),
    d('hosting', 'Prompt agents', ['Prompt agents', 'Hosted agents', 'Self-hosted orchestration']),
    c({ op: 'set_shape', shape: 'single' }),
    c({ op: 'upsert_component', kind: 'trigger', name: 'Customer message', source: 'chat', serves: ['person-1'] }),
    c({ op: 'upsert_component', kind: 'tool', name: 'Order lookup', toolType: 'openapi', serves: ['system-1'] }),
    c({ op: 'upsert_component', kind: 'tool', name: 'Refund API', toolType: 'openapi', serves: ['system-2'] }),
    c({ op: 'upsert_component', kind: 'knowledge', name: 'Policy docs', source: 'ai_search' }),
    c({ op: 'upsert_component', kind: 'agent', name: 'Support', model: 'gpt-4.1', instructions: 'Answer order questions and prepare refunds.', tools: ['Order lookup', 'Refund API'], knowledge: ['Policy docs'], serves: ['flow-1', 'goal-1'] }),
    c({ op: 'upsert_component', kind: 'approval', name: 'Refund approval', gates: 'Refund API', condition: 'refunds over 100 EUR', serves: ['oversight-1'] }),
    c({ op: 'upsert_component', kind: 'guardrail', name: 'Safety', controls: ['prompt_shields', 'harm_filters'] }),
    c({ op: 'upsert_component', kind: 'output', name: 'Reply', destination: 'chat' }),
    c({ op: 'connect', from: 'Customer message', to: 'Support', label: 'message' }),
    c({ op: 'connect', from: 'Support', to: 'Reply', label: 'answer' }),
    c({ op: 'set_scenario', flow: 'flow-1', title: 'Where is my order', steps: [{ from: 'Customer', to: 'Customer message', what: 'asks' }, { from: 'Customer message', to: 'Support', what: 'passes it on' }, { from: 'Support', to: 'Order lookup', what: 'looks it up' }] }),
  ];
  const start = supportChanges.slice(0, supportChanges.findIndex((x) => x.body.op === 'approve_stage') + 1);
  const solved = replay(emptyBoard(), [...start, ...solution, approve('solution', 'Architect')]);
  return replay(solved, [...technicalRecords, approve('technical', 'Security lead')]);
}
