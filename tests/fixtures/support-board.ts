import type { Change, ChangeBody } from '../../shared/board/changes';

const at = '2026-11-18T12:00:00.000Z';
const c = (body: ChangeBody, reason: string): Change => ({ body, actor: 'coach', reason, at });

/** A customer support system built only through changes, as the coach would. */
export const supportChanges: Change[] = [
  c({ op: 'set_title', title: 'Customer support' }, 'Name the system'),
  c({ op: 'upsert_component', kind: 'trigger', name: 'Customer message', source: 'chat' }, 'Where work enters'),
  c({ op: 'upsert_component', kind: 'tool', name: 'Order lookup', toolType: 'openapi' }, 'Order data'),
  c({ op: 'upsert_component', kind: 'tool', name: 'Refund API', toolType: 'openapi' }, 'Issues refunds'),
  c({ op: 'upsert_component', kind: 'knowledge', name: 'Policy docs', source: 'ai_search' }, 'Grounding for policy answers'),
  c({ op: 'upsert_component', kind: 'agent', name: 'Triage', instructions: 'Classify intent and hand off.' }, 'Routes requests'),
  c({ op: 'upsert_component', kind: 'agent', name: 'Order Status', tools: ['Order lookup'] }, 'Answers order questions'),
  c({ op: 'upsert_component', kind: 'agent', name: 'Refunds', tools: ['Refund API'] }, 'Prepares refunds'),
  c({ op: 'upsert_component', kind: 'agent', name: 'Policy', knowledge: ['Policy docs'] }, 'Answers policy questions'),
  c({ op: 'upsert_team', name: 'Support desk', pattern: 'handoff', members: ['Triage', 'Order Status', 'Refunds', 'Policy'], startAgent: 'Triage' }, 'Triage hands off to specialists'),
  c({ op: 'upsert_component', kind: 'approval', name: 'Refund approval', gates: 'Refund API', condition: 'refunds over 100 EUR' }, 'Money movement is irreversible'),
  c({ op: 'upsert_component', kind: 'guardrail', name: 'Safety', controls: ['prompt_shields', 'harm_filters'] }, 'Protect every agent'),
  c({ op: 'upsert_component', kind: 'output', name: 'Reply to customer', destination: 'chat' }, 'Where answers go'),
  c({ op: 'connect', from: 'Customer message', to: 'Triage', label: 'message' }, 'Entry point'),
  c({ op: 'connect', from: 'Support desk', to: 'Reply to customer', label: 'answer' }, 'Team output'),
];
