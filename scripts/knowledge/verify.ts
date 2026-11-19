/**
 * Checks the guidance snapshot before it is proposed or used.
 *
 *   npm run knowledge:verify
 *
 * Fails when a source is missing or thin, when a section id repeats, when a
 * link leaves the source's prefixes, when a section is empty, or when a
 * Well-Architected pillar has no design review checklist items.
 */
import { loadGuidance } from '../../server/knowledge';
import { SOURCES } from '../../shared/knowledge/sources';
import type { Snapshot } from '../../shared/knowledge/snapshot';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fail, notice } from './report';

const MIN_PAGES: Record<string, number> = { 'well-architected': 100, 'architecture-center-ai': 20, 'cloud-adoption-ai-agents': 4 };
const PILLARS = ['reliability', 'security', 'cost-optimization', 'operational-excellence', 'performance-efficiency'];

async function main() {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const source of SOURCES) {
    let snap: Snapshot;
    try {
      snap = JSON.parse(await readFile(path.resolve('data/knowledge', `${source.id}.json`), 'utf8'));
    } catch {
      problems.push(`${source.id}: snapshot file missing or unreadable`);
      continue;
    }
    const sections = snap.pages.reduce((n, p) => n + p.sections.length, 0);
    const listing = snap.pages.length <= 40 ? `\n${snap.pages.map((p) => p.url.replace(/^https:\/\/learn\.microsoft\.com\/en-us/, '')).join('\n')}` : '';
    notice(`${source.id}`, `${snap.pages.length} pages, ${sections} sections, ${snap.checklist.length} checklist items${listing}`);
    if (snap.pages.length < (MIN_PAGES[source.id] ?? 1)) problems.push(`${source.id}: only ${snap.pages.length} pages`);
    for (const page of snap.pages) {
      if (!source.prefixes.some((p) => page.url.startsWith(p.replace(/\/$/, '')))) problems.push(`${page.url}: outside ${source.id}`);
      if (!page.sections.length) problems.push(`${page.url}: no sections`);
      for (const s of page.sections) {
        if (ids.has(s.id)) problems.push(`${s.id}: repeated section id`);
        ids.add(s.id);
        if (!s.text.trim()) problems.push(`${s.id}: empty section`);
        if (!s.url.startsWith(page.url)) problems.push(`${s.id}: link does not point into its page`);
      }
    }
    if (source.id === 'well-architected') {
      for (const pillar of PILLARS) {
        const n = snap.checklist.filter((i) => i.pillar === pillar).length;
        if (n < 5) problems.push(`well-architected: ${n} checklist items for ${pillar}`);
      }
    }
  }
  if (problems.length) {
    fail(`Snapshot check failed:\n${problems.join('\n')}`);
  }
  const g = await loadGuidance();
  for (const s of g.sources()) console.log(`${s.id}: ${s.pages} pages, ${s.sections} sections`);
  console.log(`checklist: ${g.checklist().length} items`);
}

main().catch(fail);
