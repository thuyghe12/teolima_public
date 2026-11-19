import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { discovery, discoveryRefusal, TOPICS } from '../shared/board/discovery';
import { DECISION_TOPICS, SECTIONS, sectionsOf } from '../shared/board/arc42';
import { applyChange, type Change, type ChangeBody } from '../shared/board/changes';
import { emptyBoard, type Board } from '../shared/board/schema';
import { stageDocument, stageMarkdown } from '../shared/board/spec-document';
import { approved, discovered, discoveryChanges } from './fixtures/support-board';

const at = '2026-11-19T12:00:00.000Z';
const ch = (body: ChangeBody, actor: Change['actor'] = 'coach', quote: string | null = 'as the user said it'): Change => ({
  body,
  actor,
  reason: 'test',
  at,
  ...(quote ? { basis: { source: 'user' as const, quote } } : {}),
});
const record = (b: Board, body: ChangeBody, actor: Change['actor'] = 'coach', quote: string | null = 'as the user said it') => {
  const r = applyChange(b, ch(body, actor, quote));
  assert.ok(r.ok, 'error' in r ? r.error : '');
  return r.board;
};
const item = (fields: Omit<Extract<ChangeBody, { op: 'record_item' }>, 'op'>): ChangeBody => ({ op: 'record_item', ...fields });

test('stage 1 is arc42 sections 1 to 3, in order', () => {
  assert.deepEqual(sectionsOf('discovery').map((s) => `${s.id} ${s.title}`), [
    '1.1 Requirements overview',
    '1.2 Quality goals',
    '1.3 Stakeholders',
    '2 Constraints',
    '3.1 Scope',
    '3.2 Business context',
  ]);
});

test('an empty document misses every required topic, in order', () => {
  const d = discovery(emptyBoard());
  assert.equal(d.done, false);
  assert.deepEqual(d.missing.map((t) => t.id), ['goals', 'metrics', 'flows', 'oversight', 'security', 'stakeholders', 'scope', 'people', 'systems']);
  assert.deepEqual(d.open.map((t) => t.id), ['out_of_scope', 'reliability', 'performance', 'cost', 'operations', 'rollout']);
  assert.match(discoveryRefusal(d), /^Discovery is not done\. .*Goals \("What business outcome .*recorded as 1\.1 Goal\)/);
});

test('topics are covered by the right section and type; quality topics by attribute, or by a constraint category', () => {
  let b = emptyBoard();
  b = record(b, item({ section: '1.2', type: 'quality', attribute: 'privacy', text: 'Only the customer sees their orders' }));
  b = record(b, item({ section: '2', type: 'constraint', category: 'business', text: 'Live before the summer sale' }));
  b = record(b, item({ section: '1.2', type: 'quality', attribute: 'accessibility', text: 'Usable with a screen reader' }));
  const covered = discovery(b).topics.filter((t) => t.covered).map((t) => t.topic.id);
  assert.deepEqual(covered, ['security', 'cost'], 'privacy is a security concern; a budget or timeline constraint covers cost; accessibility has no pillar');
});

test('each section takes only its own types, with the fields they need', () => {
  const refuse = (body: ChangeBody, pattern: RegExp) => {
    const r = applyChange(emptyBoard(), ch(body));
    assert.ok('error' in r && pattern.test(r.error), JSON.stringify(body));
  };
  refuse(item({ section: '1.1', type: 'stakeholder', text: 'x' }), /Section 1\.1 takes goal \(goal\), metric \(success metric\)/);
  refuse(item({ section: '1.3', type: 'stakeholder', text: 'Owns it' }), /needs a short name/);
  refuse(item({ section: '1.2', type: 'quality', text: 'Fast' }), /names its quality attribute/);
  refuse(item({ section: '2', type: 'constraint', text: 'EU only' }), /names its category/);
  refuse(item({ section: '12', type: 'goal', text: 'x' }), /no section "12"/);
  const noSource = applyChange(emptyBoard(), ch(item({ section: '1.1', type: 'goal', text: 'x' }), 'coach', null));
  assert.ok('error' in noSource && /needs its source/.test(noSource.error));
});

test('what the user types in the app is theirs; editing a quoted item makes it theirs', () => {
  let b = record(emptyBoard(), item({ section: '1.1', type: 'goal', text: 'Fewer tickets' }), 'coach', 'fewer tickets');
  assert.deepEqual(b.spec.items[0].source, { kind: 'user', quote: 'fewer tickets' });
  b = record(b, { op: 'record_item', id: 'goal-1', section: '1.1', type: 'goal', text: 'Half the tickets by June' }, 'user', null);
  assert.deepEqual(b.spec.items[0], { id: 'goal-1', section: '1.1', type: 'goal', text: 'Half the tickets by June', source: { kind: 'typed' } });
  b = record(b, item({ section: '1.3', type: 'stakeholder', name: 'CFO', text: 'Signs off the budget' }), 'user', null);
  assert.equal(b.spec.items[1].id, 'stakeholder-1');
});

test('the user adds, renames and removes sections of their own; the template sections stay', () => {
  let b = record(emptyBoard(), { op: 'add_section', title: 'Open questions for legal' }, 'user', null);
  assert.deepEqual(b.spec.sections, [{ id: 'x-open-questions-for-legal', stage: 'discovery', title: 'Open questions for legal' }]);
  b = record(b, item({ section: 'x-open-questions-for-legal', type: 'note', text: 'Can call transcripts be stored?' }), 'user', null);
  assert.equal(b.spec.items[0].id, 'note-1');
  const wrongType = applyChange(b, ch(item({ section: 'x-open-questions-for-legal', type: 'goal', text: 'x' }), 'user', null));
  assert.ok('error' in wrongType && /takes notes/.test(wrongType.error));
  b = record(b, { op: 'rename_section', ref: 'x-open-questions-for-legal', title: 'Legal questions' }, 'user', null);
  assert.equal(b.spec.sections[0].title, 'Legal questions');
  const coach = applyChange(b, ch({ op: 'add_section', title: 'Mine' }));
  assert.ok('error' in coach && /the ones the user adds/.test(coach.error));
  const template = applyChange(b, ch({ op: 'remove_section', ref: '1.1' }, 'user', null));
  assert.ok('error' in template && /part of the template/.test(template.error));
  b = record(b, { op: 'remove_section', ref: 'x-open-questions-for-legal' }, 'user', null);
  assert.deepEqual([b.spec.sections, b.spec.items], [[], []]);
});

test('an approved stage document is frozen until it is reopened', () => {
  const b = approved({ ...emptyBoard(), brief: { goal: 'Answer order questions', audience: '', constraints: [] } });
  const late = applyChange(b, ch(item({ section: '1.1', type: 'goal', text: 'Another goal' }), 'user', null));
  assert.ok('error' in late && /belongs to discovery, which is approved/.test(late.error));
  const removal = applyChange(b, ch({ op: 'remove_item', ref: 'goal-1' }, 'user', null));
  assert.ok('error' in removal && /approved/.test(removal.error));
});

test('design is refused until discovery is approved', () => {
  const briefed = applyChange(emptyBoard(), { body: { op: 'set_brief', goal: 'Rebook deliveries' }, actor: 'user', reason: 'test', at });
  assert.ok(briefed.ok);
  const early = applyChange(discovered(briefed.board), ch({ op: 'set_shape', shape: 'single' }, 'coach', null));
  assert.ok('error' in early && /current stage is discovery/.test(early.error));
  assert.ok(discovery(discovered(emptyBoard())).done, 'the fixture covers every required topic');
  assert.ok(applyChange(approved(briefed.board), ch({ op: 'set_shape', shape: 'single' }, 'coach', null)).ok);
  assert.equal(discoveryChanges.length, 10);
});

test('the stage document lists the template sections, then the user’s, and exports as arc42 Markdown', () => {
  let b = discovered({ ...emptyBoard(), title: 'Customer support', brief: { goal: 'Answer order questions', audience: '', constraints: [] } });
  b = record(b, { op: 'add_section', title: 'Legal questions' }, 'user', null);
  b = record(b, item({ section: '1.2', type: 'quality', attribute: 'reliability', text: 'Order status available 99.9% of the time' }), 'coach', 'always available');
  const doc = stageDocument(b, 'discovery');
  assert.deepEqual(doc.map((s) => s.number || s.title), ['1.1', '1.2', '1.3', '2', '3.1', '3.2', 'Legal questions']);
  const md = stageMarkdown(b, 'discovery', {});
  assert.match(md, /^# Customer support: discovery\n\n\*Context diagram and functional specification\. For business sponsor, product owner and presales architect\. Not yet approved\.\*/);
  assert.match(md, /## 1\. Introduction and goals\n\n### 1\.1 Requirements overview\n\n- \*\*Goal:\*\* Customers get answers in minutes instead of days\n  <br>\*"wait days for answers", said in the session\*/);
  assert.match(md, /\| 1 \| Order status available 99\.9% of the time \| Reliability \| "always available", said in the session \|/);
  assert.match(md, /## 2\. Constraints\n\n\| Constraint \| Category \| Source \|/);
  assert.match(md, /\| Customer \| Person \| Asks about orders \|/);
  assert.match(md, /## Legal questions\n\n\*Nothing recorded yet\.\*/);
  assert.match(md, /## Open questions\n\n- \*\*Out of scope\*\*: What is explicitly not part of it\?/);
  assert.match(md, /Structured as \[arc42\]\(https:\/\/docs\.arc42\.org\/home\/\), sections 1\.1, 1\.2, 1\.3, 2, 3\.1, 3\.2/);
});

test('every topic and section cites guidance that exists in the guidance snapshot', () => {
  const ids = new Set<string>();
  for (const f of ['well-architected', 'architecture-center-ai', 'cloud-adoption-ai-agents']) {
    const snap = JSON.parse(readFileSync(`data/knowledge/${f}.json`, 'utf8')) as { pages: { url: string; sections: { id: string }[] }[] };
    for (const p of snap.pages) {
      ids.add(p.url);
      for (const s of p.sections) ids.add(s.id);
    }
  }
  const cited = [...TOPICS.flatMap((t) => t.guidance), ...SECTIONS.flatMap((s) => s.guidance), ...Object.values(DECISION_TOPICS).map((d) => d.guidance)];
  for (const url of cited) assert.ok(ids.has(url), `${url} is in the snapshot`);
  for (const t of TOPICS) assert.match(t.question, /\?$/, t.id);
});
