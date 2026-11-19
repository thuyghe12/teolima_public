/**
 * The guidance snapshot: Microsoft Learn doc sets as a map of pages and sections.
 *
 * One JSON file per source under data/knowledge/. A page carries its place in
 * Microsoft's table of contents, its area and pillar, and its sections; a
 * section carries its heading trail, its link and its text. The map is what an
 * agent browses (outline, then a page's headings, then one section); the text
 * is what it quotes, and what a quote is checked against.
 *
 * The files are written so that a rebuild with no changes on Microsoft Learn
 * produces no diff: no build timestamp, and a page's retrieved date only moves
 * when its text changed.
 */
import { chunkMarkdown, classify, extractChecklist, hashText, type Area, type ChecklistItem, type Pillar, type TocPage } from './parse';
import type { Source } from './sources';

export interface Section {
  /** Unique within the snapshot: the section URL, with a suffix if a page repeats a heading. */
  id: string;
  heading: string;
  /** Page title, then H2, then H3. */
  headings: string[];
  /** Opens the section on Microsoft Learn. */
  url: string;
  text: string;
}

export interface Page {
  url: string;
  title: string;
  /** Table of contents sections above the page, outermost first. */
  trail: string[];
  area: Area;
  pillar: Pillar | null;
  hash: string;
  /** Day the current text was retrieved (YYYY-MM-DD). */
  retrieved: string;
  sections: Section[];
}

export interface Snapshot {
  source: Omit<Source, 'baseUrl'> & { attribution: string };
  pages: Page[];
  /** Coded recommendations from the design review checklists (RE:01, SE:06, ...). */
  checklist: ChecklistItem[];
}

/** A fetched page as sections, each heading's section kept whole. */
export function buildPage(md: string, toc: TocPage, retrieved: string): Page {
  const chunks = chunkMarkdown(md, toc, Infinity);
  const { area, pillar } = classify(toc.url);
  const seen = new Map<string, number>();
  const sections = chunks.map((c) => {
    const n = (seen.get(c.url) ?? 0) + 1;
    seen.set(c.url, n);
    return { id: n === 1 ? c.url : `${c.url}~${n}`, heading: c.heading, headings: c.headings, url: c.url, text: c.content };
  });
  return {
    url: toc.url,
    title: chunks[0]?.headings[0] ?? toc.title,
    trail: toc.trail,
    area,
    pillar,
    hash: hashText(md),
    retrieved,
    sections,
  };
}

/** The checklist items found on a page, if it is a design review checklist. */
export function checklistOf(md: string, url: string): ChecklistItem[] {
  return /\/checklist$/.test(url) ? extractChecklist(md, url) : [];
}

/** Keeps the earlier retrieved date for pages whose text did not change, so unchanged pages produce no diff. */
export function keepUnchanged(page: Page, previous: Page | undefined): Page {
  return previous && previous.hash === page.hash ? { ...page, retrieved: previous.retrieved } : page;
}
