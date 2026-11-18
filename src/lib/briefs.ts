/**
 * The brief the user writes before a call, and the briefs they used recently.
 *
 * Limits match the server schema (shared/board/schema.ts), so what the form
 * accepts is what the server saves. Recent briefs live in this browser only.
 */

export interface BriefDraft {
  goal: string;
  audience: string;
  constraints: string[];
}

export const BRIEF_LIMITS = { goal: 600, audience: 200, constraints: 12, constraint: 200 } as const;

export const emptyBrief = (): BriefDraft => ({ goal: '', audience: '', constraints: [] });

/** One constraint per line; blank lines dropped, each trimmed and capped. */
export function constraintsFromText(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim().slice(0, BRIEF_LIMITS.constraint))
    .filter(Boolean)
    .slice(0, BRIEF_LIMITS.constraints);
}

/** Trimmed and capped to the server limits. */
export function normalizeBrief(b: BriefDraft): BriefDraft {
  return {
    goal: b.goal.trim().slice(0, BRIEF_LIMITS.goal),
    audience: b.audience.trim().slice(0, BRIEF_LIMITS.audience),
    constraints: b.constraints
      .map((c) => c.trim().slice(0, BRIEF_LIMITS.constraint))
      .filter(Boolean)
      .slice(0, BRIEF_LIMITS.constraints),
  };
}

const KEY = 'teolima.recentBriefs';
const MAX_RECENT = 5;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isBrief(v: unknown): v is BriefDraft {
  const b = v as BriefDraft;
  return !!b && typeof b.goal === 'string' && typeof b.audience === 'string' && Array.isArray(b.constraints)
    && b.constraints.every((c) => typeof c === 'string');
}

/** Most recent first. Anything unreadable is ignored rather than trusted. */
export function recentBriefs(store: StorageLike | null = storage()): BriefDraft[] {
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isBrief).map(normalizeBrief).filter((b) => b.goal).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

/** Puts a brief first; an older brief with the same goal is replaced. */
export function rememberBrief(brief: BriefDraft, store: StorageLike | null = storage()): BriefDraft[] {
  const b = normalizeBrief(brief);
  if (!b.goal || !store) return recentBriefs(store);
  const same = (x: BriefDraft) => x.goal.toLowerCase() === b.goal.toLowerCase();
  const next = [b, ...recentBriefs(store).filter((x) => !same(x))].slice(0, MAX_RECENT);
  try {
    store.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full or blocked: the brief still goes to the server
  }
  return next;
}
