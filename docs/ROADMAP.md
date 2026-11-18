# Roadmap

**One unified git tree. Many actors. Two views. One compile target.**

Today the board lives in the canvas engine as a list of drawn elements, and a session is saved as a snapshot. The roadmap turns the board into a typed, versioned document that every actor writes to, and makes that document compilable.

| Phase | Outcome | Decision record |
|---|---|---|
| 1. Board schema and change log | The board is a typed document; the canvas is a view of it; every change is a patch with actor, reason and time | [ADR 0001](adr/0001-board-as-versioned-tree.md) |
| 2. Git tree and code view | Patches are committed to a git tree per board; a toggle switches between whiteboard and code view with changes coloured by actor | [ADR 0001](adr/0001-board-as-versioned-tree.md) |
| 3. Compiler | Compile turns the board into a reviewed Azure AI Foundry deployment package, with AI Landing Zone defaults and a wizard that only asks about open assumptions | [ADR 0003](adr/0003-compile-to-foundry-package.md) |
| 4. Memory workers | Narrow, rubric-driven workers commit what they learn to memory branches of the same tree; a conductor resolves duplicates and conflicts | [ADR 0002](adr/0002-memory-workers-on-the-tree.md) |

**Progress:** phase 1 has started. The typed board model and its change log are in `shared/board/` ([BOARD_MODEL.md](BOARD_MODEL.md)); next, the coach switches to tools that edit this model, and the canvas renders it with computed layout.

Phase 3 comes before phase 4 because the compiler is what turns a design session into something deployable, and it can be built and tested without the voice interface.

## Platform

Supabase is the backend for everything outside the tree itself:

- **Auth:** Supabase Auth, with row level security on every table keyed to the user.
- **Board storage:** each board's tree is stored per user; Postgres holds the board index and commit metadata for fast listing.
- **Memory index:** memory entries are committed to the tree and indexed in Postgres with pgvector for retrieval.
- **Sessions:** the existing `call_sessions` table moves under auth and row level security.

## Also planned

- Move the Live model to the current generally available Live model once tested (the id is configurable today through `GEMINI_LIVE_MODEL`).
- Evals: replay recorded sessions against the live model and score the resulting board (every component connected, a guardrail present for sensitive domains, a human approval gate for irreversible actions), and compile every eval board in CI.
- A hosted demo behind `ACCESS_TOKEN` with spend limits on the provider key.
- Managed Application packaging of compiled boards for reseller distribution (constraints in [AZURE_TARGETS.md](AZURE_TARGETS.md)).
