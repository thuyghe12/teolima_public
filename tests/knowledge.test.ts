// Fixtures are short excerpts in the shape Microsoft Learn returns them (Azure Well-Architected Framework, CC BY 4.0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchor, chunkMarkdown, classify, clean, extractChecklist, flattenToc, hashText, linkedPages } from '../shared/knowledge/parse';

const BASE = 'https://learn.microsoft.com/en-us/azure/well-architected/';
const PREFIX = 'https://learn.microsoft.com/en-us/azure/well-architected/';

const toc = {
  items: [
    {
      toc_title: 'Well-Architected Framework',
      children: [
        {
          toc_title: 'About',
          children: [
            { href: 'what-is-well-architected-framework', toc_title: 'What is the Well-Architected Framework' },
            {
              toc_title: 'How to be a proficient architect',
              children: [
                { href: 'architect-role/fundamentals', toc_title: 'Architect role' },
                { toc_title: 'Responsibilities', children: [{ href: 'architect-role/design-diagrams', toc_title: 'Create design diagrams' }] },
              ],
            },
          ],
        },
        { toc_title: 'Reliability', children: [{ href: 'reliability/checklist', toc_title: 'Checklist' }, { href: 'reliability/', toc_title: 'Quick links' }] },
        { href: 'https://learn.microsoft.com/en-us/azure/architecture/', toc_title: 'Architecture Center' },
        { href: 'reliability/checklist#top', toc_title: 'Duplicate' },
      ],
    },
  ],
};

test('the table of contents becomes page URLs, with their trail, inside the allowed prefixes only', () => {
  const pages = flattenToc(toc, BASE, [PREFIX]);
  assert.deepEqual(pages.map((p) => p.url.replace(PREFIX, '')), [
    'what-is-well-architected-framework',
    'architect-role/fundamentals',
    'architect-role/design-diagrams',
    'reliability/checklist',
    'reliability',
  ]);
  assert.deepEqual(pages[2].trail, ['Well-Architected Framework', 'About', 'How to be a proficient architect', 'Responsibilities']);
});

test('pages are classified by where they sit in the guidance', () => {
  assert.deepEqual(classify(`${PREFIX}architect-role/design-diagrams`), { area: 'architect-role', pillar: null });
  assert.deepEqual(classify(`${PREFIX}security/checklist`), { area: 'pillar', pillar: 'security' });
  assert.deepEqual(classify(`${PREFIX}service-guides/azure-cosmos-db`), { area: 'service-guide', pillar: null });
  assert.deepEqual(classify(`${PREFIX}ai/design-principles`), { area: 'workload', pillar: null });
  assert.deepEqual(classify('https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns'), { area: 'architecture-center', pillar: null });
  assert.deepEqual(classify('https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ai-agents/'), { area: 'cloud-adoption', pillar: null });
});

const checklistPage = `# Design review checklist for Operational Excellence\r
\r
This checklist presents a set of recommendations to help you build a culture of operational excellence.\r
\r
## Checklist\r
\r
|  | Code | Recommendation |\r
| --- | --- | --- |\r
| ☐ | [OE:01](devops-culture) | **Define your standard practices to develop and operate your workload.** Align team members' specializations to clear practices. |\r
| ☐ | [OE:02](formalize-operations-tasks) | Use standardization as a way to make routine, ad-hoc, and emergency operations consistent and predictable. |\r
| ☐ | [OE:07](observability)[OE:07](instrument-application) | **Design a monitoring stack** that captures operational telemetry. |\r
\r
## Next step\r
\r
> [!div class="nextstepaction"]\r
> [Tradeoffs](tradeoffs)\r
`;

test('a checklist yields its coded recommendations as plain text, each linked to its page', () => {
  const items = extractChecklist(checklistPage, `${PREFIX}operational-excellence/checklist`);
  assert.deepEqual(items.map((i) => i.code), ['OE:01', 'OE:02', 'OE:07']);
  assert.equal(items[0].pillar, 'operational-excellence');
  assert.equal(items[0].text, "Define your standard practices to develop and operate your workload. Align team members' specializations to clear practices.");
  assert.equal(items[0].url, `${PREFIX}operational-excellence/devops-culture`);
  assert.equal(items[2].url, `${PREFIX}operational-excellence/observability`);
});

test('a page is chunked under its headings, each chunk with a citable URL and anchor', () => {
  const chunks = chunkMarkdown(checklistPage, { url: `${PREFIX}operational-excellence/checklist`, title: 'Checklist' });
  assert.equal(chunks[0].heading, 'Design review checklist for Operational Excellence');
  assert.equal(chunks[0].url, `${PREFIX}operational-excellence/checklist`);
  const list = chunks.find((c) => c.heading === 'Checklist')!;
  assert.equal(list.url, `${PREFIX}operational-excellence/checklist#checklist`);
  assert.deepEqual(list.headings, ['Design review checklist for Operational Excellence', 'Checklist']);
  assert.match(list.content, /OE:01/);
  assert.ok(chunks.every((c, i) => c.ordinal === i));
});

test('long sections split on paragraphs, and headings inside code blocks are not headings', () => {
  const para = 'Word '.repeat(300).trim();
  const md = `# Title\n\n## Big\n\n${para}\n\n${para}\n\n\`\`\`bash\n# not a heading\n\`\`\``;
  const chunks = chunkMarkdown(md, { url: 'https://x/y', title: 'T' });
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((c) => c.content.length <= 2200));
  assert.ok(chunks.every((c) => c.heading === 'Big'));
  assert.match(chunks.at(-1)!.content, /# not a heading/);
});

test('Learn markup without guidance is removed; notes stay readable', () => {
  const md = 'Text\r\n\r\n:::image type="content" source="a.png" alt-text="x":::\r\n![x](a.png)\r\n<!-- hidden -->\r\n> [!NOTE]\r\n> Keep this.';
  assert.equal(clean(md), 'Text\n\n> Note:\n> Keep this.');
});

test('anchors and hashes are stable', () => {
  assert.equal(anchor('Design a monitoring stack (OE:07)'), 'design-a-monitoring-stack-oe07');
  assert.equal(anchor('Tradeoffs'), 'tradeoffs');
  assert.equal(hashText('abc'), hashText('abc'));
  assert.notEqual(hashText('abc'), hashText('abd'));
});


test('links inside the prefixes are followed, so a split table of contents still reaches every page', () => {
  const hub = 'https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ai-agents';
  const md = `See [Business plan](business-strategy-plan) and [Build](/azure/cloud-adoption-framework/ai-agents/build-secure-process#steps "title").
Also [WAF](https://learn.microsoft.com/en-us/azure/well-architected/), [self](./), [elsewhere](https://example.com/ai-agents/x), [again](business-strategy-plan?tabs=a)
and an image [diagram](images/ai-agent-adoption-process.svg).`;
  const found = linkedPages(md, { url: hub, folder: true }, [`${hub}/`]);
  assert.deepEqual(found.map((p) => p.url).sort(), [`${hub}/build-secure-process`, `${hub}/business-strategy-plan`]);
  assert.ok(found.every((p) => !p.folder));
  // The same link from a page that is not a folder index resolves one level up, outside the prefix.
  assert.deepEqual(linkedPages('[x](business-strategy-plan)', { url: hub }, [`${hub}/`]), []);
  assert.equal(flattenToc({ items: [{ href: 'ai-agents/', toc_title: 'AI agents' }] }, 'https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/', [`${hub}/`])[0].folder, true);
});

test('nested HTML comments leave nothing behind', async () => {
  const { clean } = await import('../shared/knowledge/parse');
  assert.doesNotMatch(clean('a <!-<!-- x -->- y --> b'), /<!--/);
});
