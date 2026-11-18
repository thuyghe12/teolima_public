# ADR 0004: Anchor every design in Microsoft's published guidance

**Status:** Accepted. Procedure and checks implemented; the notation is rendered in a later change.

## Context

The coach designed systems in a free style: it chose elements, patterns and layout on its own judgment. A reviewer has no way to tell whether such a design follows any standard, and a free-form design is a weak input for a compiler (ADR 0003). Microsoft publishes no single notation for multi-agent systems, but it does publish guidance on when to use several agents, which orchestration pattern fits which work, how to build agents safely, and how to draw architecture diagrams.

## Decision

1. **One written standard.** [DESIGN_STANDARD.md](../DESIGN_STANDARD.md) turns that guidance into an eight-step procedure: brief, one agent or several, orchestration pattern, tools and knowledge, guardrails, human approvals, where work enters and leaves, evaluation. Each rule cites its source.
2. **Checked in code, not only in the prompt.** The board records the single-or-multi decision and its reason, the change log refuses a second agent or a team without one, and `readiness()` checks every step against the board.
3. **The coach follows the order.** Every tool result carries the first unfinished step, and the prompt tells the coach to work through them in order.
4. **One agent is the default.** The guidance treats a single agent with tools as the starting point and names the reasons that justify more. The coach proposes several agents only with one of those reasons, and the user agrees before it is saved.

## Consequences

- Every design can be explained step by step with a source behind each choice, which is what a reviewer or a client's architect will ask for.
- Fewer multi-agent designs: the coach now argues for the simplest design that works, as the guidance does.
- The compiler can rely on decisions the board records instead of inferring them.
- Readiness is shared by the coach, the app and the compiler, so "ready to compile" means one thing everywhere.
- Guidance changes over time. The standard links each rule to its source so it can be re-checked, and changing a rule means changing the document, the check and its test together.
