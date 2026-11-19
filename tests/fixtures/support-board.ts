import { replay, type Basis, type Change, type ChangeBody } from '../../shared/board/changes';
import { emptyBoard, type Board, type Requirement } from '../../shared/board/schema';

const at = '2026-11-18T12:00:00.000Z';
const c = (body: ChangeBody, reason: string, basis?: Basis): Change => ({ body, actor: 'coach', reason, at, ...(basis ? { basis } : {}) });

const req = (kind: Requirement['kind'], text: string, quote: string, pillar?: Requirement['pillar']): Change =>
  c({ op: 'record_requirement', kind, text, ...(pillar ? { pillar } : {}) }, 'Stated by the user', { source: 'user', quote });

/** A discovery that covers every required topic: what every test design needs before it can be built. */
export const discoveryChanges: Change[] = [
  req('problem', 'Customers wait days for answers about orders and refunds', 'wait days for answers'),
  req('outcome', 'Most order questions are answered without a person', 'answered without a person'),
  req('user', 'Customers of a web shop', 'customers of a web shop'),
  req('scenario', 'A customer asks where an order is and gets its status', 'where is my order'),
  req('integration', 'Reads the order system and issues refunds through the refund API', 'order system and refund API'),
  req('oversight', 'Refunds over 100 EUR need a person', 'refunds over 100 EUR need a person'),
  req('nonfunctional', 'Customer data stays in the EU', 'data stays in the EU', 'security'),
];

/** Records the discovery on a board. */
export const discovered = (board: Board): Board => replay(board, discoveryChanges);

export const DISCOVERED_SPEC = discovered(emptyBoard()).spec;

/** A customer support system built only through changes, as the coach would. */
/** A board with a goal and nothing else: where every test design starts. */
export const briefedBoard = (): Board => ({
  ...emptyBoard(),
  brief: { goal: 'Test system', audience: '', constraints: [] },
  spec: DISCOVERED_SPEC,
  shape: { kind: 'multi', reasons: ['security_or_compliance_boundary'] },
});

export const supportChanges: Change[] = [
  c({ op: 'set_brief', goal: 'Answer order questions and handle refunds safely', audience: 'Customers of a web shop', constraints: ['Refunds over 100 EUR need a person'] }, 'Brief from the user'),
  ...discoveryChanges,
  c({ op: 'set_title', title: 'Customer support' }, 'Name the system'),
  c({ op: 'set_shape', shape: 'multi', reasons: ['security_or_compliance_boundary'] }, 'Only the refund agent may move money'),
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
