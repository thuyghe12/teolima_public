# ADR 0001: The board is a versioned document in a git tree

**Status:** Accepted, not yet implemented

## Context

The canvas engine owns the board as a list of drawn elements. Sessions are saved as snapshots. There is no record of who changed what, or why, and anything else that wants to know about the design (memory, a compiler, a reviewer) would need its own copy and would drift from the board over time.

## Decision

There is one source of truth per board: a typed document stored as a git tree.

- **Schema.** A zod schema defines the document. Nodes are typed (`intake`, `router`, `agent`, `tool`, `knowledge`, `memory`, `guardrail`, `human_approval`) and carry configuration fields that map to deployable resources later (model, instructions, tools, data sources, approval rules). Edges carry data flow and conditions. Explanatory drawings (sketches, callouts, free strokes) are a separate node kind and never hold configuration.
- **Patches.** Every change is a patch at a path in the document, with an actor (`user`, `coach`, or a named worker), a reason and a timestamp. The canvas never edits state directly; it renders the document and emits patches.
- **Commits.** Patches are grouped per coach turn or per user gesture and committed to the board's `main` branch, with the actor and reason in the commit message and trailers. One commit per stroke would make the history unreadable.
- **Two views.** The whiteboard renders the document. The code view renders the same tree: files, history, and diffs coloured by actor, with the reason shown for each change. Selecting a commit highlights what it changed on the board.

## Consequences

- The compiler and the workers read and write the same document, so they cannot drift from the board.
- Every design decision has an author and a reason, which is also what a reviewer needs before deploying.
- The canvas engine has to be refactored to render from the document; the existing tool calls become patch producers. This is the main cost.
- Storage needs a git implementation that works per user; see the Platform section of the roadmap.
