# ADR 0007: Scope to infrastructure as code, for AI agent solutions on Azure

**Status:** Accepted.

## Context

Speaking an idea and watching a diagram appear is a good demonstration, but enterprises do not deploy what a demonstration produces. A review of the product raised these points:

- Production infrastructure is declarative (Bicep or Terraform) so it can be versioned, reviewed and changed later. Imperative scripts do not survive day 2.
- Microsoft builds AI assistance into Azure itself. A product that competes with it on Microsoft's own platform carries platform risk.
- Every resource needs role-based access, network isolation, tags and compliance policies from the first deployment.
- Describing a complex architecture out loud is slower and less precise than pasting what was already said or written, such as a discovery call transcript, an RFP or notes.
- The money is in pre-sales. Consultancies and Microsoft partners spend unbilled days turning a discovery conversation into a design, a cost estimate and a statement of work, and the engineer who builds it weeks later loses what was said.

## Decision

Teolima turns a scoping conversation into a reviewed, deployable package for an AI agent solution on Azure.

- **Users.** Solutions architects at Microsoft partners and in-house platform teams, in discovery and pre-sales: a live co-design session with a client, or the hours after one.
- **Inputs.** Voice for live co-design and quick changes. A pasted transcript, RFP or notes for what was already said, processed in one pass through the same tools and provenance checks as voice: every element must quote its source. Photos of whiteboard sketches come later.
- **Focus.** AI agent solutions on Microsoft Foundry and Agent Framework, including what they need to run safely: network isolation, identity, keys and secrets, monitoring, as Microsoft's AI landing zone guidance describes. Not general Azure infrastructure, and not other clouds.
- **Process.** Microsoft's architect process: discovery, functional specification, solution design drawn per audience, design specification (including disaster recovery, security and compliance), then compile. Every decision cites the guidance it rests on ([ADR 0006](0006-guidance-snapshot.md)).
- **Output.** The core is an Azure Developer CLI project: Bicep for the infrastructure and declarative agent and workflow definitions ([ADR 0003](0003-compile-to-foundry-package.md), [ADR 0005](0005-high-level-board-exact-meaning.md)). Around it: the diagrams, the design specification, a cost estimate from public list prices (the Azure Retail Prices API) with usage assumptions stated, and a draft statement of work. Scripts appear only for steps Bicep cannot express, such as setup after deployment.
- **Standards as data.** Security baselines and approved modules are data that the checks and the compiler read, not prompt text. Teolima ships Microsoft's defaults (Azure Verified Modules, AI landing zone); an organisation adds its own, so a distributor can set a baseline that its resellers extend.
- **Hand-off, not replacement.** The package opens in Microsoft's tools: `azd` deploys it, Foundry's workflow designer and VS Code edit it. Teolima is the step before them.
- **Out of scope:** Teolima's own memory of users and boards ([ADR 0002](0002-memory-workers-on-the-tree.md), withdrawn).

## Consequences

- The compiler, the specifications and the cost estimate matter as much as the board, and each can be tested without voice.
- Transcript input reuses provenance as it stands: a quote is checked against the pasted text instead of the spoken transcript.
- What Teolima offers next to Microsoft's own assistants is the process and the evidence: the architect's method, a cited source for every decision, checks in code, and an audit trail.
- Staying with AI agent solutions keeps the board model, the guidance and the checks deep enough to be right.
