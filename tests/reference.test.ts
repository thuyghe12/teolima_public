/**
 * The acceptance test for solution design: a Microsoft reference architecture,
 * specified from its published page, must come out of Teolima's stages as
 * Microsoft designed it, with every line traceable to the page or the client.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyChange, replay } from '../shared/board/changes';
import { emptyBoard, type Board } from '../shared/board/schema';
import { gate } from '../shared/board/stages';
import { stageMarkdown } from '../shared/board/spec-document';
import { layoutWorkspace } from '../shared/board/workspace';
import { quoteFound } from '../server/guard/provenance';
import { assertClean } from './helpers/layout';
import { CLIENT_WORDS, REFERENCE_DOC, referenceDiscovery, referenceSolution, referenceText } from './fixtures/reference-workflow-automation';

const discovered = (): Board => replay(emptyBoard(), referenceDiscovery);
const designed = (): Board => replay(emptyBoard(), [...referenceDiscovery, ...referenceSolution]);

test('every change in the reference is accepted', () => {
  const all = [...referenceDiscovery, ...referenceSolution];
  let b = emptyBoard();
  for (const ch of all) {
    const r = applyChange(b, ch);
    assert.ok(r.ok, `${ch.body.op} refused: ${'error' in r ? r.error : ''}`);
    b = r.board;
  }
});

test('discovery covers every required topic from the page, and the client answers what the page leaves open', () => {
  const b = discovered();
  assert.equal(b.stage.current, 'solution', 'discovery was approved');
  const page = referenceText();
  const said = CLIENT_WORDS.join('\n');
  for (const i of b.spec.items) {
    if (i.source.kind === 'document') {
      assert.equal(i.source.document, REFERENCE_DOC);
      assert.ok(quoteFound(i.source.quote ?? '', page), `${i.id} quotes the page: "${i.source.quote}"`);
    } else {
      assert.equal(i.source.kind, 'user');
      assert.ok(quoteFound(i.source.quote ?? '', said), `${i.id} quotes the client`);
    }
  }
  // the page states no approval rule and no measurable target
  assert.deepEqual(b.spec.items.filter((i) => i.source.kind === 'user').map((i) => i.type).sort(), ['metric', 'oversight']);
});

test('solution design reaches an approvable state with the decisions Microsoft made', () => {
  const b = designed();
  assert.deepEqual(gate(b, 'solution'), { ready: true, missing: [] });
  const decided = Object.fromEntries(b.spec.items.filter((i) => i.type === 'decision').map((i) => [i.topic, i.name]));
  assert.deepEqual(decided, { platform: 'Microsoft Foundry', complexity: 'Several agents', pattern: 'Sequential', hosting: 'Hosted agents' });
  const page = referenceText();
  for (const i of b.spec.items.filter((x) => x.section === '9' || x.section === '4')) assert.ok(quoteFound(i.source.quote ?? '', page), `${i.id} quotes the page`);
  assert.ok(quoteFound(b.spec.scenarios[0].source.quote ?? '', page));
});

test('the building blocks are the page\'s: four specialised agents in order, on GPT-4.1, with Cosmos DB for history', () => {
  const b = designed();
  assert.equal(b.shape.kind, 'multi');
  const team = b.teams[0];
  assert.equal(team.pattern, 'sequential');
  const name = (id: string) => b.components.find((c) => c.id === id)?.name;
  assert.deepEqual(team.members.map(name), ['SQL analysis', 'Translation', 'Validation', 'Documentation']);
  for (const a of b.components.filter((c) => c.kind === 'agent')) assert.equal(a.kind === 'agent' && a.model, 'gpt-4.1');
  const memory = b.components.find((c) => c.kind === 'memory');
  assert.ok(memory && memory.kind === 'memory' && memory.store === 'cosmos_db');
});

test('the reference draws cleanly in every view, and its document has no open gaps', () => {
  const b = designed();
  const w = layoutWorkspace(b);
  assertClean(w);
  assert.deepEqual(w.frames.map((f) => f.id), ['discovery', 'solution']);
  assert.equal(w.panels.length, 1);
  const md = stageMarkdown(b, 'solution');
  assert.ok(!md.includes('not covered'));
  assert.ok(!md.includes('Open before approval'));
  assert.match(md, /Hosted agents \(chosen\)/);
});
