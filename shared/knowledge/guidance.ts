/**
 * Progressive disclosure over the guidance snapshot.
 *
 * An agent never gets the whole corpus. It moves down Microsoft's own
 * structure, one small step at a time:
 *
 *   outline    the pages of a source, area or pillar, with their place in the table of contents
 *   page       one page's headings, each with a section id
 *   section    one section's text, with its link and the day it was retrieved
 *   checklist  the coded design review recommendations (RE:01, SE:06, ...)
 *   find       a keyword search over headings and text, for a term whose place is unknown
 *   quoted     whether a quote really appears in a section, to check what an agent cites
 *
 * Everything is in memory and deterministic: the same snapshot and the same
 * question give the same answer, and every answer carries a Microsoft Learn link.
 */
import type { ChecklistItem, Pillar } from './parse';
import type { Page, Section, Snapshot } from './snapshot';

export interface OutlineEntry {
  url: string;
  title: string;
  trail: string[];
  area: string;
  pillar: string | null;
}

export interface PageView {
  url: string;
  title: string;
  trail: string[];
  area: string;
  pillar: string | null;
  retrieved: string;
  sections: { id: string; heading: string; depth: number }[];
}

export interface SectionView extends Section {
  page: string;
  retrieved: string;
  source: string;
  license: string;
}

export interface Hit {
  id: string;
  url: string;
  heading: string;
  headings: string[];
  snippet: string;
  score: number;
}

export interface Scope {
  source?: string;
  areas?: string[];
  pillars?: string[];
}

const STOP = new Set(
  'a an and are as at be by for from how in is it of on or that the this to with what when which your you can should do does use using'.split(' '),
);

/** Lowercase words and numbers; checklist codes such as SE:06 stay one token. */
export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]{2}:\d{2}|[\p{L}\p{N}]+/gu) ?? []).filter((t) => !STOP.has(t));
}

interface Doc {
  section: Section;
  page: Page;
  source: Snapshot['source'];
  tf: Map<string, number>;
  length: number;
}

const WEIGHT = { heading: 3, title: 2, text: 1 };
const K1 = 1.2;
const B = 0.75;

export class Guidance {
  private readonly pages = new Map<string, { page: Page; source: Snapshot['source'] }>();
  private readonly sections = new Map<string, Doc>();
  private readonly df = new Map<string, number>();
  private readonly avgLength: number;

  constructor(private readonly snapshots: Snapshot[]) {
    let total = 0;
    for (const snap of snapshots) {
      for (const page of snap.pages) {
        this.pages.set(page.url, { page, source: snap.source });
        for (const section of page.sections) {
          const tf = new Map<string, number>();
          const add = (text: string, w: number) => {
            for (const t of tokens(text)) tf.set(t, (tf.get(t) ?? 0) + w);
          };
          add(section.headings.slice(1).join(' '), WEIGHT.heading);
          add(page.title, WEIGHT.title);
          add(section.text, WEIGHT.text);
          const length = [...tf.values()].reduce((a, b) => a + b, 0);
          total += length;
          this.sections.set(section.id, { section, page, source: snap.source, tf, length });
          for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
        }
      }
    }
    this.avgLength = this.sections.size ? total / this.sections.size : 1;
  }

  /** The sources in the snapshot, with page and section counts. */
  sources(): { id: string; title: string; pages: number; sections: number; license: string }[] {
    return this.snapshots.map((s) => ({
      id: s.source.id,
      title: s.source.title,
      pages: s.pages.length,
      sections: s.pages.reduce((n, p) => n + p.sections.length, 0),
      license: s.source.license,
    }));
  }

  private inScope(page: Page, source: Snapshot['source'], scope: Scope): boolean {
    return (
      (!scope.source || source.id === scope.source) &&
      (!scope.areas?.length || scope.areas.includes(page.area)) &&
      (!scope.pillars?.length || (page.pillar !== null && scope.pillars.includes(page.pillar)))
    );
  }

  /** The pages in scope, in table of contents order. */
  outline(scope: Scope = {}): OutlineEntry[] {
    const out: OutlineEntry[] = [];
    for (const { page, source } of this.pages.values()) {
      if (this.inScope(page, source, scope)) out.push({ url: page.url, title: page.title, trail: page.trail, area: page.area, pillar: page.pillar });
    }
    return out;
  }

  /** One page's headings. Accepts a page URL or the URL of one of its sections. */
  page(url: string): PageView | null {
    const entry = this.pages.get(url.split('#')[0].replace(/\/$/, ''));
    if (!entry) return null;
    const { page } = entry;
    return {
      url: page.url,
      title: page.title,
      trail: page.trail,
      area: page.area,
      pillar: page.pillar,
      retrieved: page.retrieved,
      sections: page.sections.map((s) => ({ id: s.id, heading: s.heading, depth: s.headings.length - 1 })),
    };
  }

  /** One section's text with its citation. */
  section(id: string): SectionView | null {
    const doc = this.sections.get(id);
    if (!doc) return null;
    return { ...doc.section, page: doc.page.url, retrieved: doc.page.retrieved, source: doc.source.id, license: doc.source.license };
  }

  /** Design review checklist items, optionally for some pillars or codes. */
  checklist(filter: { pillars?: Pillar[] | string[]; codes?: string[] } = {}): ChecklistItem[] {
    const codes = filter.codes?.map((c) => c.toUpperCase());
    return this.snapshots
      .flatMap((s) => s.checklist)
      .filter((i) => (!filter.pillars?.length || (filter.pillars as string[]).includes(i.pillar)) && (!codes?.length || codes.includes(i.code)));
  }

  /** Sections ranked by keyword relevance (BM25, headings weighted above body text). */
  find(query: string, scope: Scope = {}, limit = 8): Hit[] {
    const terms = [...new Set(tokens(query))];
    if (!terms.length) return [];
    const n = this.sections.size;
    const hits: Hit[] = [];
    for (const doc of this.sections.values()) {
      if (!this.inScope(doc.page, doc.source, scope)) continue;
      let score = 0;
      for (const t of terms) {
        const tf = doc.tf.get(t);
        if (!tf) continue;
        const df = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * doc.length) / this.avgLength));
      }
      if (score > 0) {
        hits.push({ id: doc.section.id, url: doc.section.url, heading: doc.section.heading, headings: doc.section.headings, snippet: snippet(doc.section.text, terms), score });
      }
    }
    return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, Math.max(1, Math.min(limit, 30)));
  }

  /** Whether the quote appears in the section, ignoring case, whitespace and Markdown emphasis. */
  quoted(id: string, quote: string): boolean {
    const doc = this.sections.get(id);
    const q = plain(quote);
    return Boolean(doc && q.length >= 12 && plain(doc.section.text).includes(q));
  }
}

function plain(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** About 240 characters of the text around the first query term it contains. */
function snippet(text: string, terms: string[]): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const lower = flat.toLowerCase();
  const at = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 80);
  const end = Math.min(flat.length, start + 240);
  return `${start > 0 ? '...' : ''}${flat.slice(start, end)}${end < flat.length ? '...' : ''}`;
}
