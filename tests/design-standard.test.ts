// The design standard cites Microsoft's guidance; every Microsoft Learn link it uses must still exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Doc sets outside the guidance snapshot, cited deliberately. */
const OUTSIDE_SNAPSHOT = ['https://learn.microsoft.com/agent-framework/'];

test('every Microsoft Learn link in the design standard exists in the guidance snapshot', () => {
  const ids = new Set<string>();
  for (const f of ['well-architected', 'architecture-center-ai', 'cloud-adoption-ai-agents']) {
    const snap = JSON.parse(readFileSync(`data/knowledge/${f}.json`, 'utf8')) as { pages: { url: string; sections: { id: string }[] }[] };
    for (const p of snap.pages) {
      ids.add(p.url);
      for (const s of p.sections) ids.add(s.id);
    }
  }
  const links = [...readFileSync('docs/DESIGN_STANDARD.md', 'utf8').matchAll(/https:\/\/learn\.microsoft\.com\/[^)\s]+/g)].map((m) => m[0]);
  assert.ok(links.length >= 8);
  for (const link of links) {
    if (OUTSIDE_SNAPSHOT.some((p) => link.startsWith(p))) continue;
    // links are written without a locale; the snapshot stores en-us, without a trailing slash
    const url = link.replace('learn.microsoft.com/azure/', 'learn.microsoft.com/en-us/azure/').replace(/\/(#|$)/, '$1');
    assert.ok(ids.has(url), `${link} is in the snapshot`);
  }
});
