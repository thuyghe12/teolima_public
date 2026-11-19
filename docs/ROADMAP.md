# Roadmap

**From a scoping conversation to a reviewed, deployable package for an AI agent solution on Azure** ([ADR 0007](adr/0007-scope-to-iac.md)).

Teolima follows Microsoft's architect process: discovery, functional specification, solution design drawn per audience, design specification, then compile. The board is a typed, versioned document that every actor writes to, and every decision cites the guidance it rests on.

## Built

| Phase | Outcome | Decision record |
|---|---|---|
| Board schema and change log | The board is a typed document; the canvas is a view of it; every change is a patch with actor, reason and time | [ADR 0001](adr/0001-board-as-versioned-tree.md) |
| Design standard | Designs follow a written standard anchored in Microsoft's guidance, checked in code | [ADR 0004](adr/0004-design-standard.md) |
| Exact board model | Every element has one compile meaning in Agent Framework, Foundry or Azure, with its source; per agent: model, tools, knowledge, memory, conversation history | [ADR 0005](adr/0005-high-level-board-exact-meaning.md) |
| Guidance snapshot | Microsoft's architecture guidance ships as a versioned map of pages and sections, read by progressive disclosure, with quotes checked against the text and a weekly reviewed refresh | [ADR 0006](adr/0006-guidance-snapshot.md) |

## Next, in order

| Step | Outcome | Decision record |
|---|---|---|
| 1. Architect process | Discovery and a functional specification replace the short brief, from voice or from a pasted transcript, RFP or notes; every requirement quotes its source | [ADR 0007](adr/0007-scope-to-iac.md) |
| 2. Solution model | The board describes the whole solution: boundaries, actors, hosting, data stores, memory, identity, network, observability, deployment and numbered flows. A Microsoft reference architecture is the test it must reproduce | [ADR 0005](adr/0005-high-level-board-exact-meaning.md) |
| 3. Diagrams per audience | A renderer with Microsoft's official icons, nested boundaries and numbered steps, and a view per audience: context, solution, deployment | [ADR 0004](adr/0004-design-standard.md) |
| 4. Compiler | Compile produces an Azure Developer CLI project (Bicep and declarative agents) with landing zone defaults, plus the design specification, a cost estimate from public list prices and a draft statement of work | [ADR 0003](adr/0003-compile-to-foundry-package.md) |
| 5. Specialist workers | Narrow workers, one per part of the solution (network, identity, memory, tools, observability), each reading only its part of the guidance and drawing its part of the board, coordinated so cross-cutting dependencies stay consistent | |
| 6. Organisation standards | An organisation's own baseline and approved modules, as data the checks and the compiler read | [ADR 0007](adr/0007-scope-to-iac.md) |
| 7. Git tree and code view | Patches are committed to a git tree per board; a toggle switches between whiteboard and code view, coloured by actor | [ADR 0001](adr/0001-board-as-versioned-tree.md) |

Out of scope: Teolima's own memory of users and boards ([ADR 0002](adr/0002-memory-workers-on-the-tree.md), withdrawn). Memory in the solutions Teolima designs is a full part of the board model.

## Platform

The app runs with a Gemini key and nothing else. Supabase is optional, for saved boards with sign-in and row level security; without it, boards stay in the browser.

## Also planned

- Move the Live model to the current generally available Live model once tested (the id is configurable today through `GEMINI_LIVE_MODEL`).
- Evals: replay recorded sessions against the live model and score the resulting board (every component connected, a guardrail present for sensitive domains, a human approval gate for irreversible actions), and compile every eval board in CI.
- A hosted demo behind `ACCESS_TOKEN` with spend limits on the provider key.
- Managed Application packaging of compiled boards for reseller distribution (constraints in [AZURE_TARGETS.md](AZURE_TARGETS.md)).
