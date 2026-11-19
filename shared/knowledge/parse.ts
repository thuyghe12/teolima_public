/**
 * Turns Microsoft Learn documentation into a citable knowledge base.
 *
 * Pure functions with no dependencies, used by the snapshot build
 * (scripts/knowledge/build.ts) and covered by tests/knowledge.test.ts:
 *
 *   flattenToc       a Learn toc.json into page URLs with their place in the table of contents
 *   classify         which part of the guidance a page belongs to (architect role, a pillar, ...)
 *   chunkMarkdown    a page into its sections, each with its heading trail and anchor
 *   extractChecklist the coded recommendations from a design review checklist (RE:01, SE:01, ...)
 *
 * Every section keeps the page URL, its heading trail and an anchor, so whatever
 * the coach or a worker cites can be opened and checked on Microsoft Learn.
 */

export interface TocNode {
  href?: string;
  toc_title?: string;
  children?: TocNode[];
}

export interface TocPage {
  url: string;
  title: string;
  /** Titles of the table of contents sections above this page, outermost first. */
  trail: string[];
  /** The page is a folder index (its address ends in /), which changes how its relative links resolve. */
  folder?: boolean;
}

/** Every page under the allowed URL prefixes, in table of contents order, without duplicates. */
export function flattenToc(toc: { items?: TocNode[] }, base: string, prefixes: string[]): TocPage[] {
  const seen = new Set<string>();
  const out: TocPage[] = [];
  const walk = (nodes: TocNode[] | undefined, trail: string[]) => {
    for (const n of nodes ?? []) {
      if (n.href && !/^(mailto:|#)/.test(n.href)) {
        let url = '';
        let folder = false;
        try {
          const u = new URL(n.href, base);
          u.hash = '';
          u.search = '';
          folder = u.pathname.endsWith('/');
          url = u.toString().replace(/\/$/, '');
        } catch {
          url = '';
        }
        if (url && prefixes.some((p) => url.startsWith(p.replace(/\/$/, ''))) && !seen.has(url)) {
          seen.add(url);
          out.push({ url, title: (n.toc_title ?? '').trim(), trail, ...(folder ? { folder } : {}) });
        }
      }
      walk(n.children, n.toc_title ? [...trail, n.toc_title.trim()] : trail);
    }
  };
  walk(toc.items, []);
  return out;
}

export type Area =
  | 'architect-role'
  | 'pillar'
  | 'workload'
  | 'service-guide'
  | 'design-pattern'
  | 'architecture-center'
  | 'cloud-adoption'
  | 'other';

export type Pillar = 'reliability' | 'security' | 'cost-optimization' | 'operational-excellence' | 'performance-efficiency';

const PILLARS: Pillar[] = ['reliability', 'security', 'cost-optimization', 'operational-excellence', 'performance-efficiency'];

/** Where a page sits in Microsoft's guidance, from its URL. */
export function classify(url: string): { area: Area; pillar: Pillar | null } {
  const path = new URL(url).pathname.replace(/^\/[a-z]{2}-[a-z]{2}\//, '/');
  if (path.startsWith('/azure/well-architected/')) {
    const rest = path.slice('/azure/well-architected/'.length);
    const first = rest.split('/')[0];
    if (first === 'architect-role') return { area: 'architect-role', pillar: null };
    if ((PILLARS as string[]).includes(first)) return { area: 'pillar', pillar: first as Pillar };
    if (first === 'service-guides') return { area: 'service-guide', pillar: null };
    if (first === 'design-patterns' || first === 'patterns') return { area: 'design-pattern', pillar: null };
    if (['ai', 'mission-critical', 'saas', 'sap', 'hpc', 'azure-virtual-desktop', 'oracle-iaas', 'iot', 'sustainability'].includes(first)) {
      return { area: 'workload', pillar: null };
    }
    return { area: 'other', pillar: null };
  }
  if (path.startsWith('/azure/architecture/')) return { area: 'architecture-center', pillar: null };
  if (path.startsWith('/azure/cloud-adoption-framework/')) return { area: 'cloud-adoption', pillar: null };
  return { area: 'other', pillar: null };
}

/** The anchor Microsoft Learn gives a heading: lowercase, punctuation dropped, spaces as hyphens. */
export function anchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[`*_[\]()]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

export interface Chunk {
  ordinal: number;
  /** Headings above this section, the page title first. */
  headings: string[];
  heading: string;
  url: string;
  content: string;
}

const MAX_CHARS = 2200;

/** Removes HTML comments by scanning, not by pattern: everything from an opening marker to its close, and an unclosed opening to the end. */
function stripComments(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('<!--', i);
    if (open === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, open);
    const close = text.indexOf('-->', open + 4);
    if (close === -1) break;
    i = close + 3;
  }
  return out.includes('<!--') ? stripComments(out) : out;
}

/** Removes Learn markup that carries no guidance: images, include markers, zone pivots, HTML comments. */
export function clean(md: string): string {
  return stripComments(md.replace(/\r\n/g, '\n'))
    .replace(/^:::.*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/^\s*\[!INCLUDE[^\]]*\]\s*$/gim, '')
    .replace(/^> \[!(NOTE|TIP|IMPORTANT|CAUTION|WARNING)\]\s*$/gim, (_, k) => `> ${k[0]}${k.slice(1).toLowerCase()}:`)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Splits a section longer than max on paragraph boundaries. */
function split(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let cur = '';
  for (const para of text.split(/\n\n+/)) {
    if (cur && cur.length + para.length + 2 > max) {
      parts.push(cur);
      cur = '';
    }
    if (para.length > max) {
      for (let i = 0; i < para.length; i += max) parts.push(para.slice(i, i + max));
    } else cur = cur ? `${cur}\n\n${para}` : para;
  }
  if (cur) parts.push(cur);
  return parts;
}

/**
 * A page as sections under its H2 and H3 headings. Sections longer than
 * maxChars are split on paragraph boundaries; pass Infinity to keep each
 * heading's section whole.
 */
export function chunkMarkdown(md: string, page: { url: string; title: string }, maxChars = MAX_CHARS): Chunk[] {
  const text = clean(md);
  const lines = text.split('\n');
  const chunks: Chunk[] = [];
  let pageTitle = page.title;
  let h2 = '';
  let h3 = '';
  let buf: string[] = [];
  let inCode = false;

  const flush = () => {
    const body = buf.join('\n').trim();
    buf = [];
    if (!body) return;
    const heading = h3 || h2 || pageTitle;
    const headings = [pageTitle, h2, h3].filter(Boolean);
    const url = heading === pageTitle ? page.url : `${page.url}#${anchor(heading)}`;
    for (const part of split(body, maxChars)) chunks.push({ ordinal: chunks.length, headings, heading, url, content: part });
  };

  for (const line of lines) {
    if (/^```/.test(line)) inCode = !inCode;
    const m = !inCode && /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      const level = m[1].length;
      const title = m[2].trim();
      if (level === 1) {
        if (!chunks.length && !buf.join('').trim()) pageTitle = title;
        continue;
      }
      flush();
      if (level === 2) {
        h2 = title;
        h3 = '';
      } else h3 = title;
      continue;
    }
    buf.push(line);
  }
  flush();
  return chunks;
}

export interface ChecklistItem {
  code: string;
  pillar: string;
  /** The recommendation, as plain text. */
  text: string;
  /** The page that explains it. */
  url: string;
}

const PILLAR_PREFIX: Record<string, Pillar> = {
  RE: 'reliability',
  SE: 'security',
  CO: 'cost-optimization',
  OE: 'operational-excellence',
  PE: 'performance-efficiency',
};

/** The coded recommendations in a design review checklist table, e.g. "| ☐ | [OE:01](devops-culture) | ... |". */
export function extractChecklist(md: string, pageUrl: string): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  const base = pageUrl.endsWith('/') ? pageUrl : pageUrl.replace(/[^/]*$/, '');
  for (const line of clean(md).split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    const codeCell = cells.find((c) => /\[(RE|SE|CO|OE|PE):\d{2}\]\(/.test(c));
    if (!codeCell) continue;
    const m = /\[((RE|SE|CO|OE|PE):\d{2})\]\(([^)]+)\)/.exec(codeCell)!;
    const text = cells[cells.indexOf(codeCell) + 1] ?? '';
    const plain = text.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();
    if (!plain || out.some((i) => i.code === m[1])) continue;
    let url: string;
    try {
      url = new URL(m[3], base).toString();
    } catch {
      url = pageUrl;
    }
    out.push({ code: m[1], pillar: PILLAR_PREFIX[m[2]], text: plain, url });
  }
  return out;
}

/** A stable fingerprint of a page's text, to skip pages that did not change since the last run. */
export function hashText(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}


/**
 * Pages a page links to inside the allowed prefixes. Microsoft Learn splits
 * large tables of contents, so a toc.json can stop at a section's hub page;
 * following the hub's links reaches the rest. Links without a locale are read
 * as the locale of the page that links to them.
 */
export function linkedPages(md: string, page: { url: string; folder?: boolean }, prefixes: string[]): { url: string; folder: boolean }[] {
  const pageUrl = page.url;
  const base = page.folder ? `${pageUrl}/` : pageUrl;
  const locale = /^\/([a-z]{2}-[a-z]{2})\//.exec(new URL(pageUrl).pathname)?.[1];
  const out = new Map<string, boolean>();
  for (const m of md.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    let u: URL;
    try {
      u = new URL(m[1], base);
    } catch {
      continue;
    }
    if (u.hostname !== 'learn.microsoft.com') continue;
    // Images and downloads are not pages.
    if (/\.[a-z0-9]{2,5}$/i.test(u.pathname)) continue;
    if (locale && !/^\/[a-z]{2}-[a-z]{2}\//.test(u.pathname)) u.pathname = `/${locale}${u.pathname}`;
    u.hash = '';
    u.search = '';
    const folder = u.pathname.endsWith('/');
    const url = u.toString().replace(/\/$/, '');
    if (url !== pageUrl && !out.has(url) && prefixes.some((p) => url.startsWith(p.replace(/\/$/, '')))) out.set(url, folder);
  }
  return [...out].map(([url, folder]) => ({ url, folder }));
}
