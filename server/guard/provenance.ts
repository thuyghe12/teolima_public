/**
 * Provenance: every requirement and element the coach adds must rest on the
 * brief, on the user's own words, or on a document the user pasted (a
 * discovery call transcript, an RFP, notes).
 *
 * The coach names a basis with each grounded tool call: a short quote and
 * where it comes from. This module checks that quote against the saved brief,
 * against what the user actually said in this session (transcribed speech and
 * typed messages), or against the named document. A quote that is not there
 * is refused, so a requirement or element the user never stated cannot reach
 * the board, whatever the model says.
 *
 * Speech transcription is noisy, so the check is tolerant to small wording
 * differences but not to invention: most of the quote's words must appear in
 * the source, and at least one pair of adjacent words must appear together.
 */
import type { Basis } from '../../shared/board/changes';
import type { Brief } from '../../shared/board/schema';

/** Lowercased words, punctuation removed. Keeps numbers and accented letters. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(Boolean);
}

export const MIN_QUOTE_WORDS = 2;
const COVERAGE = 0.75;

export type Verdict = { ok: true } | { ok: false; error: string };

/** Whether `quote` is found in `source`, allowing for transcription noise. */
export function quoteFound(quote: string, source: string): boolean {
  const q = words(quote);
  const s = words(source);
  if (q.length < MIN_QUOTE_WORDS || s.length === 0) return false;
  const have = new Set(s);
  const covered = q.filter((w) => have.has(w)).length / q.length;
  if (covered < COVERAGE) return false;
  const pairs = new Set(s.slice(1).map((w, i) => `${s[i]} ${w}`));
  return q.slice(1).some((w, i) => pairs.has(`${q[i]} ${w}`));
}

export const briefText = (b: Brief) => [b.goal, b.audience, ...b.constraints].join('\n');

/** What the user said in this session, in order. Speech arrives in fragments. */
export class UserWords {
  private turns: string[] = [];
  private open = '';

  /** A fragment of transcribed speech; `finished` closes the turn. */
  addSpeech(fragment: string, finished = false) {
    this.open += fragment;
    if (finished) this.closeTurn();
  }

  /** A typed message, or anything else the user wrote as a whole. */
  addText(text: string) {
    this.closeTurn();
    if (text.trim()) this.turns.push(text.trim());
  }

  closeTurn() {
    if (this.open.trim()) this.turns.push(this.open.trim());
    this.open = '';
  }

  /** The last turn the user finished, for screening. */
  lastTurn(): string {
    return this.turns[this.turns.length - 1] ?? '';
  }

  text(): string {
    return [...this.turns, this.open].join('\n');
  }
}

/** Documents the user pasted in this session, by id. */
export interface Documents {
  get(id: string): { title: string; text: string } | undefined;
}

/** Checks the basis of a coach change against the brief, the user's words or a pasted document. */
export function checkBasis(basis: Basis | null, ctx: { brief: Brief; userWords: string; documents?: Documents }): Verdict {
  if (!basis) {
    return { ok: false, error: 'Name the basis: basis_source (brief, user or document) and basis_quote, the exact words this rests on. If the user has not asked for it, propose it and wait for their answer.' };
  }
  if (words(basis.quote).length < MIN_QUOTE_WORDS) {
    return { ok: false, error: `The basis quote is too short. Quote at least ${MIN_QUOTE_WORDS} words that name what this rests on.` };
  }
  if (basis.source === 'document') {
    const doc = basis.document ? ctx.documents?.get(basis.document) : undefined;
    if (!doc) return { ok: false, error: `There is no pasted document "${basis.document ?? ''}". Name the document id given when it was added.` };
    if (quoteFound(basis.quote, doc.text)) return { ok: true };
    return { ok: false, error: `That quote is not in "${doc.title}". Quote the document's own words; record only what it states.` };
  }
  const source = basis.source === 'brief' ? briefText(ctx.brief) : ctx.userWords;
  if (quoteFound(basis.quote, source)) return { ok: true };
  return basis.source === 'brief'
    ? { ok: false, error: 'That quote is not in the brief. Build only from the brief or from what the user said; otherwise propose it and ask.' }
    : { ok: false, error: 'The user did not say that in this call. Do not add it. Propose it, wait for the user to agree, then quote their words.' };
}

/** Pasted documents for a session, with stable ids (doc-1, doc-2, ...). */
export class DocumentStore implements Documents {
  private readonly docs = new Map<string, { title: string; text: string }>();

  add(title: string, text: string): string {
    const id = `doc-${this.docs.size + 1}`;
    this.docs.set(id, { title: title.trim() || id, text });
    return id;
  }

  get(id: string) {
    return this.docs.get(id);
  }

  list(): { id: string; title: string; words: number }[] {
    return [...this.docs].map(([id, d]) => ({ id, title: d.title, words: words(d.text).length }));
  }
}
