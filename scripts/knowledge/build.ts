/**
 * Builds the guidance snapshot in data/knowledge/ from Microsoft Learn.
 *
 *   npm run knowledge:build                      every source
 *   npm run knowledge:build -- well-architected  one source
 *
 * For each source it reads the table of contents, fetches every page through
 * the Microsoft Learn MCP server (microsoft_docs_fetch returns the page as
 * Markdown) and writes one JSON file. Links to pages inside the source's
 * prefixes are followed too, because Microsoft Learn splits large tables of
 * contents and a toc.json can stop at a section's hub page. Pages that fail to fetch keep their
 * previous version; if more than a few fail, nothing is written and the build
 * exits with an error, so a bad run never replaces a good snapshot.
 *
 * The weekly GitHub Action runs this and proposes the diff as a pull request.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fail, notice } from './report';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { flattenToc, linkedPages, type TocPage } from '../../shared/knowledge/parse';
import { buildPage, checklistOf, keepUnchanged, type Page, type Snapshot } from '../../shared/knowledge/snapshot';
import { ATTRIBUTION, SOURCES, type Source } from '../../shared/knowledge/sources';

const LEARN_MCP = 'https://learn.microsoft.com/api/mcp';
const OUT_DIR = path.resolve('data/knowledge');
const CONCURRENCY = 3;
const ATTEMPTS = 6;
/** Upper bound on pages per source, in case links lead further than expected. */
const MAX_PAGES = 600;
/** Share of pages allowed to fail before the build refuses to write. */
const MAX_FAILED = 0.05;

const today = new Date().toISOString().slice(0, 10);

async function connect(): Promise<Client> {
  const client = new Client({ name: 'teolima-knowledge-build', version: '0.1.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(LEARN_MCP)));
  return client;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetches JSON, waiting and retrying when Microsoft Learn rate limits (429) or fails (5xx). */
async function fetchJson(url: string): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= ATTEMPTS) throw new Error(`${url} returned ${res.status}`);
    const after = Number(res.headers.get('retry-after'));
    await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 120) * 1000 : Math.min(5000 * 2 ** attempt, 90_000));
  }
}

async function fetchMarkdown(client: Client, url: string): Promise<string> {
  let last: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = (await client.callTool({ name: 'microsoft_docs_fetch', arguments: { url } }, undefined, { timeout: 60_000 })) as {
        content?: Array<{ type: string; text?: string }>;
        isError?: boolean;
      };
      const text = (res.content ?? []).map((c) => c.text ?? '').join('\n').trim();
      if (res.isError || !text) throw new Error(res.isError ? 'tool returned an error' : 'empty page');
      return text;
    } catch (err) {
      last = err;
      if (attempt < ATTEMPTS) await sleep(1000 * 2 ** attempt);
    }
  }
  throw last;
}

async function readPrevious(file: string): Promise<Snapshot | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Snapshot;
  } catch {
    return null;
  }
}

async function buildSource(client: Client, source: Source, tocJson: unknown): Promise<void> {
  const file = path.join(OUT_DIR, `${source.id}.json`);
  const previous = await readPrevious(file);
  const prevPages = new Map((previous?.pages ?? []).map((p) => [p.url, p]));

  const toc: TocPage[] = tocJson
    ? flattenToc(tocJson as { items?: [] }, source.baseUrl, source.prefixes)
    : (source.seeds ?? []).map((url) => ({ url: url.replace(/\/$/, ''), title: '', trail: [], ...(url.endsWith('/') ? { folder: true } : {}) }));
  if (!toc.length) throw new Error(`${source.id}: no pages under ${source.prefixes.join(', ')}`);

  const fromToc = toc.length;
  const pages: (Page | undefined)[] = [];
  const checklists = new Map<number, Snapshot['checklist']>();
  const failed: string[] = [];
  const queued = new Set(toc.map((p) => p.url));
  let next = 0;
  let active = 0;

  const worker = async () => {
    while (next < toc.length || active > 0) {
      if (next >= toc.length) {
        // Another worker may still find links to follow.
        await sleep(200);
        continue;
      }
      const i = next++;
      const entry: TocPage = toc[i];
      active++;
      try {
        const md = await fetchMarkdown(client, entry.url);
        pages[i] = keepUnchanged(buildPage(md, entry, today), prevPages.get(entry.url));
        checklists.set(i, checklistOf(md, entry.url));
        for (const link of linkedPages(md, entry, source.prefixes)) {
          if (queued.has(link.url) || toc.length >= MAX_PAGES) continue;
          queued.add(link.url);
          toc.push({ url: link.url, title: '', trail: [...entry.trail, pages[i]!.title], ...(link.folder ? { folder: true } : {}) });
        }
      } catch (err) {
        failed.push(`${entry.url}: ${err instanceof Error ? err.message : String(err)}`);
        const old = prevPages.get(entry.url);
        if (old) {
          pages[i] = { ...old, trail: entry.trail };
          // A checklist page's items link to pages in the same pillar folder.
          const folder = entry.url.replace(/[^/]*$/, '');
          if (/\/checklist$/.test(entry.url)) checklists.set(i, (previous?.checklist ?? []).filter((c) => c.url.startsWith(folder)));
        }
      } finally {
        active--;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (failed.length > toc.length * MAX_FAILED) {
    throw new Error(`${source.id}: ${failed.length} of ${toc.length} pages failed, snapshot not written:\n${failed.join('\n')}`);
  }
  notice(
    `${source.id} build`,
    `${fromToc} pages from the table of contents, ${toc.length - fromToc} found through links, ${failed.length} failed` +
      (failed.length ? `\n${failed.slice(0, 15).join('\n')}` : ''),
  );

  const checklist = [...checklists.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([, items]) => items)
    .filter((item, i, all) => all.findIndex((x) => x.code === item.code) === i);

  const snapshot: Snapshot = {
    source: {
      id: source.id,
      title: source.title,
      ...(source.tocUrl ? { tocUrl: source.tocUrl } : { seeds: source.seeds }),
      prefixes: source.prefixes,
      license: source.license,
      attribution: ATTRIBUTION,
    },
    pages: pages.filter((p): p is Page => Boolean(p)),
    checklist,
  };
  await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`);
  const sections = snapshot.pages.reduce((n, p) => n + p.sections.length, 0);
  console.log(`${source.id}: ${snapshot.pages.length} pages, ${sections} sections, ${checklist.length} checklist items`);
}

async function main() {
  const only = process.argv.slice(2);
  const unknown = only.filter((id) => !SOURCES.some((s) => s.id === id));
  if (unknown.length) throw new Error(`unknown source: ${unknown.join(', ')}`);
  await mkdir(OUT_DIR, { recursive: true });
  const sources = SOURCES.filter((s) => !only.length || only.includes(s.id));
  // Tables of contents first: Microsoft Learn rate limits toc.json once many pages have been fetched.
  const tocs = new Map<string, unknown>();
  for (const s of sources) if (s.tocUrl) tocs.set(s.id, await fetchJson(s.tocUrl));
  const client = await connect();
  try {
    for (const source of sources) await buildSource(client, source, tocs.get(source.id));
  } finally {
    await client.close().catch(() => undefined);
  }
}

main().catch(fail);
