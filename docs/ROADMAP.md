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
| Stages and gates | Four stages (discovery, solution design, technical design, compile), each for its own audience with its own diagram, drawn below the last on one board; only a person approves a stage | [ADR 0007](adr/0007-scope-to-iac.md) |
| Architect process: discovery | The functional specification as arc42 sections 1 to 3, following Microsoft's discovery method, editable inline; the business context draws the C4 system context; every line names its source | [ADR 0008](adr/0008-arc42-and-c4.md) |
| Architect process: solution design | arc42 4 solution strategy (the recommendation), 5 building blocks with a traceability table, 6 numbered runtime scenarios per user flow, 9 decision records with the options weighed; drawn as a C4 container view with the context's people and systems, and a C4 dynamic view per scenario; approval needs every flow, rule and external system traced; Microsoft's multiple-agent workflow automation, specified from its page, is the acceptance test | [ADR 0008](adr/0008-arc42-and-c4.md) |
| Architect process: technical design | arc42 7 deployment settings and environments, 8 crosscutting concepts, 10 quality scenarios with measures, 11 risks, debt and assumptions; the Well-Architected review of all 59 checklist recommendations; drawn as a C4 deployment view of the resources the baseline Foundry architecture prescribes for the design | [ADR 0008](adr/0008-arc42-and-c4.md) |

## Next, in order

| Step | Outcome | Decision record |
|---|---|---|
| 1. Compiler | A complete Azure Developer CLI project on the AI Landing Zone Bicep, traced to the stage documents; a wizard for the few dilemmas only; a shared folder view where the infrastructure and agent teams review and edit the files, with typed parameters and every line coloured by its origin; save, download, or push to GitHub and deploy. Board, documents and files versioned in one git tree | [ADR 0003](adr/0003-compile-to-foundry-package.md) |
| 2. Specialist workers | Narrow workers, one per part of the solution (network, identity, memory, tools, observability), each reading only its part of the guidance and drawing its part of the board, coordinated so cross-cutting dependencies stay consistent | |
| 3. Organisation standards | An organisation's own baseline and approved modules, as data the checks and the compiler read | [ADR 0007](adr/0007-scope-to-iac.md) |

Out of scope: Teolima's own memory of users and boards ([ADR 0002](adr/0002-memory-workers-on-the-tree.md), withdrawn). Memory in the solutions Teolima designs is a full part of the board model.

## Platform

The app runs with a Gemini key and nothing else. Supabase is optional, for saved boards with sign-in and row level security; without it, boards stay in the browser.

## Also planned

- Move the Live model to the current generally available Live model once tested (the id is configurable today through `GEMINI_LIVE_MODEL`).
- Evals: replay recorded sessions against the live model and score the resulting board (every component connected, a guardrail present for sensitive domains, a human approval gate for irreversible actions), and compile every eval board in CI.
- A hosted demo behind `ACCESS_TOKEN` with spend limits on the provider key.
- Managed Application packaging of compiled boards for reseller distribution (constraints in [AZURE_TARGETS.md](AZURE_TARGETS.md)).
