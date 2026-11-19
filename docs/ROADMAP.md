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
| Architect process: solution design | arc42 4 solution strategy (the recommendation), 5 building blocks with a traceability table, 6 numbered runtime scenarios per user flow, 9 decision records with the options weighed; drawn as a C4 container view with the context's people and systems; approval needs every flow, rule and external system traced | [ADR 0008](adr/0008-arc42-and-c4.md) |

## Next, in order

| Step | Outcome | Decision record |
|---|---|---|
| 1. Dynamic views and a reference test | A C4 dynamic view per runtime scenario, drawn below the container view; a Microsoft reference architecture, specified from its published page, as the fixture solution design must reproduce | [ADR 0008](adr/0008-arc42-and-c4.md) |
| 2. Technical design | arc42 7 deployment, 8 crosscutting concepts, 10 quality scenarios, 11 risks, reviewed against the Well-Architected pillar checklists; drawn as a C4 deployment view with Microsoft's official icons | [ADR 0008](adr/0008-arc42-and-c4.md) |
| 3. Compiler | Compile produces an Azure Developer CLI project (Bicep and declarative agents) with landing zone defaults, plus the design specification (open discovery topics become stated assumptions), a cost estimate from public list prices and a draft statement of work | [ADR 0003](adr/0003-compile-to-foundry-package.md) |
| 4. Specialist workers | Narrow workers, one per part of the solution (network, identity, memory, tools, observability), each reading only its part of the guidance and drawing its part of the board, coordinated so cross-cutting dependencies stay consistent | |
| 5. Organisation standards | An organisation's own baseline and approved modules, as data the checks and the compiler read | [ADR 0007](adr/0007-scope-to-iac.md) |
| 6. Git tree and code view | Patches are committed to a git tree per board; a toggle switches between whiteboard and code view, coloured by actor | [ADR 0001](adr/0001-board-as-versioned-tree.md) |

Out of scope: Teolima's own memory of users and boards ([ADR 0002](adr/0002-memory-workers-on-the-tree.md), withdrawn). Memory in the solutions Teolima designs is a full part of the board model.

## Platform

The app runs with a Gemini key and nothing else. Supabase is optional, for saved boards with sign-in and row level security; without it, boards stay in the browser.

## Also planned

- Move the Live model to the current generally available Live model once tested (the id is configurable today through `GEMINI_LIVE_MODEL`).
- Evals: replay recorded sessions against the live model and score the resulting board (every component connected, a guardrail present for sensitive domains, a human approval gate for irreversible actions), and compile every eval board in CI.
- A hosted demo behind `ACCESS_TOKEN` with spend limits on the provider key.
- Managed Application packaging of compiled boards for reseller distribution (constraints in [AZURE_TARGETS.md](AZURE_TARGETS.md)).
