/**
 * Provenance: every element the coach adds must rest on the brief or on the
 * user's own words.
 *
 * The coach names a basis with each building tool call: a short quote and
 * where it comes from. This module checks that quote against the saved brief
 * or against what the user actually said in this session (transcribed speech
 * and typed messages). A quote that is not there is refused, so an element
 * the user never asked for cannot reach the board, whatever the model says.
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

/** Checks the basis of a coach change against the brief and the user's words. */
export function checkBasis(basis: Basis | null, ctx: { brief: Brief; userWords: string }): Verdict {
  if (!basis) {
    return { ok: false, error: 'Name the basis: basis_source (brief or user) and basis_quote, the exact words this rests on. If the user has not asked for it, propose it and wait for their answer.' };
  }
  if (words(basis.quote).length < MIN_QUOTE_WORDS) {
    return { ok: false, error: `The basis quote is too short. Quote at least ${MIN_QUOTE_WORDS} words that name what this rests on.` };
  }
  const source = basis.source === 'brief' ? briefText(ctx.brief) : ctx.userWords;
  if (quoteFound(basis.quote, source)) return { ok: true };
  return basis.source === 'brief'
    ? { ok: false, error: 'That quote is not in the brief. Build only from the brief or from what the user said; otherwise propose it and ask.' }
    : { ok: false, error: 'The user did not say that in this call. Do not add it. Propose it, wait for the user to agree, then quote their words.' };
}
