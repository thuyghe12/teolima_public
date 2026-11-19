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

