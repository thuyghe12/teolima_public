// Fixtures are short excerpts in the shape Microsoft Learn returns them (Azure Well-Architected Framework, CC BY 4.0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Guidance, tokens } from '../shared/knowledge/guidance';
import { buildPage, checklistOf, keepUnchanged, type Snapshot } from '../shared/knowledge/snapshot';
import { ATTRIBUTION } from '../shared/knowledge/sources';
import { loadGuidance } from '../server/knowledge';

const WAF = 'https://learn.microsoft.com/en-us/azure/well-architected/';

const networkPage = `# Recommendations for networking and connectivity

Applies to this Azure Well-Architected Framework Security checklist recommendation:

|[SE:06](checklist)| **Isolate, filter, and control network traffic across both ingress and egress flows.** |
|---|---|

## Private endpoints

Use **private endpoints** to reach PaaS services over a private IP address in your virtual network.

## Segmentation

### Network security groups

Filter traffic between subnets with network security groups.

## Segmentation

A second section under a repeated heading.
`;

const checklistPage = `# Design review checklist for Security

## Checklist

| | Recommendation |
|---|---|
| &#9744; | [SE:06](networking) | **Isolate, filter, and control network traffic across both ingress and egress flows.** |
| &#9744; | [SE:07](encryption) | **Encrypt data by using modern, industry-standard methods.** |
`;

const rolePage = `# Architecture design diagrams

## Diagrams for different audiences

Create diagrams that fit their audience: a context diagram for stakeholders and a detailed view for engineers.
`;

function fixture(): Snapshot {
  const day = '2026-11-19';
  const pages = [
    buildPage(networkPage, { url: `${WAF}security/networking`, title: 'Networking', trail: ['Security'] }, day),
    buildPage(checklistPage, { url: `${WAF}security/checklist`, title: 'Checklist', trail: ['Security'] }, day),
    buildPage(rolePage, { url: `${WAF}architect-role/design-diagrams`, title: 'Diagrams', trail: ['Architect role'] }, day),
  ];
  return {
    source: { id: 'well-architected', title: 'Azure Well-Architected Framework', tocUrl: `${WAF}toc.json`, prefixes: [WAF], license: 'CC-BY-4.0', attribution: ATTRIBUTION },
    pages,
    checklist: checklistOf(checklistPage, `${WAF}security/checklist`),
  };
}

test('a page becomes whole sections with links, and repeated headings get distinct ids', () => {
  const page = buildPage(networkPage, { url: `${WAF}security/networking`, title: 'Networking', trail: ['Security'] }, '2026-11-19');
  assert.equal(page.title, 'Recommendations for networking and connectivity');
  assert.equal(page.area, 'pillar');
  assert.equal(page.pillar, 'security');
  assert.deepEqual(page.sections.map((s) => s.id.replace(`${WAF}security/networking`, '')), [
    '',
    '#private-endpoints',
    '#network-security-groups',
    '#segmentation',
  ]);
  const repeated = buildPage(`${networkPage}\n## Private endpoints\n\nAgain.\n`, { url: `${WAF}x`, title: 'x', trail: [] }, '2026-11-19');
  assert.ok(repeated.sections.some((s) => s.id === `${WAF}x#private-endpoints~2` && s.url === `${WAF}x#private-endpoints`));
});

test('an unchanged page keeps its earlier retrieved date, so a rebuild produces no diff', () => {
  const toc = { url: `${WAF}security/networking`, title: 'Networking', trail: ['Security'] };
  const old = buildPage(networkPage, toc, '2026-10-01');
  assert.equal(keepUnchanged(buildPage(networkPage, toc, '2026-11-19'), old).retrieved, '2026-10-01');
  assert.equal(keepUnchanged(buildPage(`${networkPage}\nNew advice.`, toc, '2026-11-19'), old).retrieved, '2026-11-19');
});

test('the outline narrows by area and pillar, in table of contents order', () => {
  const g = new Guidance([fixture()]);
  assert.deepEqual(g.outline({ pillars: ['security'] }).map((p) => p.url.replace(WAF, '')), ['security/networking', 'security/checklist']);
  assert.deepEqual(g.outline({ areas: ['architect-role'] }).map((p) => p.title), ['Architecture design diagrams']);
  assert.equal(g.outline({ source: 'other' }).length, 0);
  assert.deepEqual(g.sources(), [{ id: 'well-architected', title: 'Azure Well-Architected Framework', pages: 3, sections: 6, license: 'CC-BY-4.0' }]);
});

test('a page lists its headings, and a section gives its text with its citation', () => {
  const g = new Guidance([fixture()]);
  const page = g.page(`${WAF}security/networking#segmentation`);
  assert.ok(page);
  assert.deepEqual(page.sections.map((s) => [s.heading, s.depth]), [
    ['Recommendations for networking and connectivity', 0],
    ['Private endpoints', 1],
    ['Network security groups', 2],
    ['Segmentation', 1],
  ]);
  const section = g.section(`${WAF}security/networking#private-endpoints`);
  assert.ok(section);
  assert.match(section.text, /private IP address/);
  assert.equal(section.retrieved, '2026-11-19');
  assert.equal(section.license, 'CC-BY-4.0');
  assert.equal(g.page(`${WAF}missing`), null);
  assert.equal(g.section('missing'), null);
});

test('checklist items come by pillar or code', () => {
  const g = new Guidance([fixture()]);
  assert.deepEqual(g.checklist({ pillars: ['security'] }).map((i) => i.code), ['SE:06', 'SE:07']);
  assert.deepEqual(g.checklist({ codes: ['se:07'] }).map((i) => i.url), [`${WAF}security/encryption`]);
  assert.equal(g.checklist({ pillars: ['reliability'] }).length, 0);
});

test('find ranks sections whose headings match above passing mentions, and finds checklist codes', () => {
  const g = new Guidance([fixture()]);
  const hits = g.find('private endpoints');
  assert.equal(hits[0].id, `${WAF}security/networking#private-endpoints`);
  assert.match(hits[0].snippet, /private endpoints/i);
  assert.equal(g.find('SE:06')[0].url.startsWith(`${WAF}security/`), true);
  assert.equal(g.find('diagrams audience', { pillars: ['security'] }).length, 0);
  assert.equal(g.find('diagrams audience', { areas: ['architect-role'] })[0].heading, 'Diagrams for different audiences');
  assert.deepEqual(g.find('the of and'), []);
  assert.deepEqual(tokens('Use SE:06 for Private-Endpoints'), ['se:06', 'private', 'endpoints']);
});

test('a quote is accepted only when it appears in the section it cites', () => {
  const g = new Guidance([fixture()]);
  const id = `${WAF}security/networking#private-endpoints`;
  assert.equal(g.quoted(id, 'Use private endpoints to reach PaaS services'), true);
  assert.equal(g.quoted(id, 'use   PRIVATE endpoints to reach paas services'), true);
  assert.equal(g.quoted(id, 'Use public endpoints to reach PaaS services'), false);
  assert.equal(g.quoted(`${WAF}security/networking#segmentation`, 'Use private endpoints to reach PaaS services'), false);
  assert.equal(g.quoted(id, 'private'), false, 'too short to count as a quote');
});

test('the snapshot folder loads at startup, and a missing folder gives empty guidance', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'teolima-knowledge-'));
  await writeFile(path.join(dir, 'well-architected.json'), JSON.stringify(fixture()));
  await writeFile(path.join(dir, 'README.md'), '# not json');
  assert.equal((await loadGuidance(dir)).outline().length, 3);
  assert.equal((await loadGuidance(path.join(dir, 'missing'))).outline().length, 0);
});
