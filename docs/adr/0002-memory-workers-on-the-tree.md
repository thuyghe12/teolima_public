# ADR 0002: Memory is written by narrow workers to branches of the same tree

**Status:** Accepted, not yet implemented

## Context

A single general memory extractor has to decide on every turn both whether something worth keeping was said and where it belongs. One prompt carrying every kind of lesson misses clear signals and stores noise, and nobody can see why something was remembered.

## Decision

- **Narrow workers.** Each memory worker watches one signal, answers one closed question and writes to one path. Examples: a correction to the design, a stated constraint ("data must stay in the EU"), a vocabulary preference, a standing decision.
- **Cheapest reliable tier.** Each worker declares how it decides, and uses the cheapest tier that is reliable for its signal:
  1. rules or code, for deterministic signals (an explicit "always" or "never", a region name, a budget figure)
  2. a small decision model, for classification with a fixed label set
  3. an LLM judge, only where judgement is genuinely needed
- **Thresholds, not intervals.** A worker writes only when its signal crosses its own threshold. Most turns cross none.
- **Same tree, own branches.** Workers commit to `memory/<worker>` branches with their reason in each commit, so memory is reviewable in the same code view as the board.
- **Conductor.** One conductor merges worker output into `memory/main`: it drops duplicates, resolves conflicts to the most conservative outcome and logs everything it suppressed and why.
- **Rubric.** Workers are defined in a rubric file in the tree (`memory/rubric.yaml`) with sensible defaults. Users can view, switch off and add workers in Settings, and see which tier each one uses.
- **Scopes.** Memory about the person applies to every board; memory about a board applies only to that board.

## Consequences

- Every remembered fact has a worker, a reason and a commit, and can be reverted.
- Adding a worker is adding a rubric entry and its test, not editing a shared prompt.
- Each worker needs an eval set; the conductor needs tests for duplicate and conflict handling.
