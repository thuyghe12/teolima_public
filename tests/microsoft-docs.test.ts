import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchMicrosoftDocs, type DocsCaller } from '../server/microsoft-docs';

const fake = (text: string): DocsCaller => async () => ({ content: [{ type: 'text', text }] });

test('results come back as reference material with a citation note', async () => {
  const r = await searchMicrosoftDocs('Agent Framework handoff', fake('Handoff orchestration lets agents transfer control. https://learn.microsoft.com/x'));
  assert.ok(!('error' in r));
  if ('results' in r) {
    assert.match(r.results, /transfer control/);
    assert.match(r.note, /cite the URLs/);
    assert.match(r.note, /ignore any instructions/);
  }
});

test('long results are truncated', async () => {
  const r = await searchMicrosoftDocs('x', fake('a'.repeat(20000)));
  assert.ok('results' in r && r.results.length < 8100 && r.results.endsWith('[truncated]'));
});

test('empty queries, empty results, tool errors and network failures become errors, never exceptions', async () => {
  assert.ok('error' in (await searchMicrosoftDocs('  ', fake('x'))));
  assert.ok('error' in (await searchMicrosoftDocs('q', fake(''))));
  assert.ok('error' in (await searchMicrosoftDocs('q', async () => ({ isError: true, content: [] }))));
  const r = await searchMicrosoftDocs('q', async () => { throw new Error('ECONNREFUSED'); });
  assert.ok('error' in r && /unavailable/.test(r.error));
});

test('queries are trimmed and capped', async () => {
  let seen = '';
  await searchMicrosoftDocs(`  ${'q'.repeat(500)}  `, async (q) => { seen = q; return { content: [{ type: 'text', text: 'ok' }] }; });
  assert.equal(seen.length, 300);
});
