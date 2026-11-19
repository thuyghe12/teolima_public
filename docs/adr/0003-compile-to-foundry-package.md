# ADR 0003: Compile the board to an Azure Developer CLI project, reviewed in a shared workspace

**Status:** Accepted. Built: the compiler (`server/compile/`), the rule checks, the wizard, the folder view and the export. The git tree per project and the push to GitHub follow. Revised in November 2026 for the stages (ADR 0007, ADR 0008) and the Foundry support in the Azure Developer CLI.

## Context

A design session has to end with something an infrastructure team and an agent team can review, own and deploy. At a partner such as ALSO, both teams sit together, or open the same folder, as the final gate before the project leaves Teolima. A wizard cannot be that gate: it hides the files. A plain download is not one either: nobody owns it until someone has read it in their editor.

The approved stage documents already hold what the compiler needs: the decisions (arc42 section 9), the building blocks and what each serves (5), the runtime scenarios (6), and, after technical design, the deployment view, the crosscutting concepts and the quality scenarios (7, 8, 10).

## Decision

### The output is a complete azd project

```
azure.yaml                        the project, one service per agent, tools and knowledge as connections
infra/main.bicep                  composes the AI Landing Zone modules and the system's own resources
infra/main.parameters.json        every value a person may change, named and described
infra/modules/                    foundry, security, data, network
src/agents/<agent>/               only for code: main.py, Dockerfile, requirements.txt
evals/azure.eval.yaml             one evaluation per runtime scenario and quality scenario
.github/workflows/azure-dev.yml   provision and deploy with federated credentials
docs/                             the arc42 export of stages 1 to 3, one diagram per stage,
                                  docs/adr/ from section 9, the audit trail, cost and statement of work
```

- **Agents.** The hosting decision of solution design sets the shape, following the three options of the baseline Foundry architecture: prompt agents are declared in `azure.yaml`; hosted agents get source and a Dockerfile, built into an image in an Azure Container Registry the team owns and run by Foundry Agent Service; self-hosted orchestration gets source and a Dockerfile deployed to Azure Container Apps. Tools and knowledge sources become connections. Environment variables go in each service's env map; the project endpoint is provided by azd and never declared.
- **Infrastructure from the AI Landing Zone.** The Bicep composes the [AI Landing Zone](https://github.com/Azure/AI-Landing-Zones) Bicep implementation, which wraps Azure Verified Modules, instead of generating resources from scratch. Network isolation, identity, private endpoints and monitoring follow from the security answers in discovery and technical design. The Bicep is explicit, although azd can run Foundry agents without it, because the infrastructure team reviews and owns it.
- **Traceability.** Every resource, connection, agent and evaluation carries the ids of the specification items it serves, in a comment in the file and in `docs/audit-trail.json`.
- **Validation.** The project must pass `bicep build`, `bicep lint` and validation against the `azure.yaml` schema, and every evaluation board in CI must compile. The AI Landing Zone design checklist is run against the result, and each check it cannot pass is listed, never hidden.

### The workspace is the gate, the wizard holds only the dilemmas

- **Wizard.** It asks only what the documents do not settle and what is hard or impossible to change after deployment: the region (bound by data residency constraints), network isolation, model deployments and their capacity, and whether to reuse an existing platform landing zone or deploy standalone. Each question shows the default, why, and its source. Everything else is decided by the documents or editable in the files.
- **Folder view.** Both teams review the project in Teolima as a folder, the same tree they would open in their editor. Values a person may change are shown as parameters: typed, with their allowed values, editable in place, and written to `main.parameters.json`. Every line is coloured by where it comes from: an unchanged AI Landing Zone module, generated from the board (linked to the item it serves), a parameter, or a person's edit (with who and when). A file shows what will be deployed and why, in a way a plain editor cannot.
- **Leaving Teolima.** The user saves and comes back later, downloads the project, or pushes it to a GitHub repository through a GitHub connection, where the workflow runs `azd provision` and `azd deploy`.

### Everything is versioned

Each project is one git tree: the board, the stage documents, the change log and the compiled files. Every accepted change is a commit with its actor (user, coach, compiler), its reason and its source. Approving a stage tags the tree. Compiling commits the generated files; a person's edit in the folder view is a commit by that person; compiling again shows a diff and never overwrites a person's edit silently. The audit trail in `docs/` is the log of that tree.

## Implementation

- **Foundation.** `vendor/ai-landing-zone/` holds the AI Landing Zone Bicep at `v2.7.3` (commit `97e2375b`), copied unchanged with its MIT licence, the way Microsoft's Agent Landing Zone incorporates the same foundation: repository-owned source, not a submodule. `manifest.json` in every compiled project records where it came from. Only `infra/main.parameters.json` changes, and only the parameters the design decides, each kept in the landing zone's own `${VARIABLE=default}` form: the region, network isolation, deployment mode (`standalone` or `ailz-integrated` with the hub network), which data services to deploy, Container Apps for self-hosted orchestration, the model deployments, the container apps and the Cosmos DB containers. `prepareHostedAgent` exposes the landing zone's Foundry project to the agent services as `AZURE_AI_PROJECT_ENDPOINT`.
- **Agents.** The hosting decision sets the shape, as the baseline Foundry architecture describes the three options. Prompt agents are `azure.ai.agent` services with `kind: prompt`, their model, instructions, an `azure_ai_search` tool per knowledge source and connections for their tools. A team, or an agent outside a team, on hosted agents is one `azure.ai.agent` service with `kind: hosted`, running Agent Framework code: the agents from `FoundryChatClient.as_agent`, the team's orchestration from the builder of its pattern in `agent_framework.orchestrations`, wrapped with `workflow.as_agent` and served by `ResponsesHostServer`. Self-hosted orchestration is the same code as a `containerapp` service on the landing zone's Container Apps. Every API used is the one Microsoft Learn documents; the generated Python is parsed in the tests.
- **Tools.** A tool's implementation cannot be compiled from a design: each is a typed `@tool` function that raises until the agent team connects it, gated tools carry `approval_mode="always_require"`, and the project README lists every one.
- **Routines and evaluations.** Scheduled triggers become `azure.ai.routine` services. Each runtime scenario becomes a dataset and an evaluation of the agent service that runs it, graded by the built-in task adherence evaluator and a rubric evaluator per quality scenario with its measure.
- **Checks.** The tests validate every compiled `azure.yaml` against the azd schema and the Foundry extension schemas (`vendor/azd-schemas/`, pinned), and check every parameter the compiler sets against the landing zone's own `param` declarations and types. CI builds and lints the compiled Bicep of the demo design (`npm run compile:example`), which needs the public Bicep registry.

- **Checks before export.** `server/compile/checks.ts` holds 21 narrow rules over the compiled project, each owning one signal, each deterministic (a schema, code or a regular expression), each with its severity, threshold where it has one, and source: the azd schemas, the landing zone's declarations, data residency, private networking for regulated workloads, no secrets, Entra ID connections, enforced approvals, valid Python, the team's builder, pinned prereleases, traceability of every building block and decision, an evaluation per scenario, and the documents. Model judges and people are the escalation, not the first line. The user sees every rule and its result, can adjust thresholds, turn a rule off and add regex rules of their own. A blocking failure stops the export; what was turned off or added is recorded in the exported `docs/checks.md` with who approved the export.
- **Folder view.** The project opens as the folder both teams review: every file and line coloured by origin (the landing zone unchanged, the design's choices, changes in review, compiled from the board, documentation), markers on tool stubs still to connect and on approval gates, and the design's parameters editable in place with why they are set and what they serve. A change in review recompiles, reruns the checks and is marked as a person's change.

## Consequences

- The compiler can be built and tested headless, against stored boards, without the voice interface.
- The infrastructure team reviews Bicep it already trusts, the AI Landing Zone, with the system's own resources clearly marked on top.
- The wizard stays short because the stages did the work; a long wizard means a stage gate let something through.
- The same tree serves export, push and deploy, so there is one history from the first discovery question to the deployed resource.
- A Managed Application variant for reseller distribution is a later output format of the same compiler.
