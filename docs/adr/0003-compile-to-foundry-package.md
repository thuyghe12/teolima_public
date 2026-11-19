# ADR 0003: Compile the board to an Azure Developer CLI project, reviewed in a shared workspace

**Status:** Accepted, not yet implemented. Revised in November 2026 for the stages (ADR 0007, ADR 0008) and the Foundry support in the Azure Developer CLI. Targets verified in [AZURE_TARGETS.md](../AZURE_TARGETS.md).

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
src/agents/<agent>/               only for hosted agents: main.py, Dockerfile, requirements.txt
evals/azure.eval.yaml             one evaluation per runtime scenario and quality scenario
.github/workflows/azure-dev.yml   provision and deploy with federated credentials
docs/                             the arc42 export of stages 1 to 3, one diagram per stage,
                                  docs/adr/ from section 9, the audit trail, cost and statement of work
```

- **Agents.** Prompt agents are declared in `azure.yaml` by default; a hosted agent, with source and a Dockerfile, only when solution design decided on code-driven orchestration (decision on agent hosting). Tools and knowledge sources become connections. Environment variables go in each service's env map; the project endpoint is provided by azd and never declared.
- **Infrastructure from the AI Landing Zone.** The Bicep composes the [AI Landing Zone](https://github.com/Azure/AI-Landing-Zones) Bicep implementation, which wraps Azure Verified Modules, instead of generating resources from scratch. Network isolation, identity, private endpoints and monitoring follow from the security answers in discovery and technical design. The Bicep is explicit, although azd can run Foundry agents without it, because the infrastructure team reviews and owns it.
- **Traceability.** Every resource, connection, agent and evaluation carries the ids of the specification items it serves, in a comment in the file and in `docs/audit-trail.json`.
- **Validation.** The project must pass `bicep build`, `bicep lint` and validation against the `azure.yaml` schema, and every evaluation board in CI must compile. The AI Landing Zone design checklist is run against the result, and each check it cannot pass is listed, never hidden.

### The workspace is the gate, the wizard holds only the dilemmas

- **Wizard.** It asks only what the documents do not settle and what is hard or impossible to change after deployment: the region (bound by data residency constraints), network isolation, model deployments and their capacity, and whether to reuse an existing platform landing zone or deploy standalone. Each question shows the default, why, and its source. Everything else is decided by the documents or editable in the files.
- **Folder view.** Both teams review the project in Teolima as a folder, the same tree they would open in their editor. Values a person may change are shown as parameters: typed, with their allowed values, editable in place, and written to `main.parameters.json`. Every line is coloured by where it comes from: an unchanged AI Landing Zone module, generated from the board (linked to the item it serves), a parameter, or a person's edit (with who and when). A file shows what will be deployed and why, in a way a plain editor cannot.
- **Leaving Teolima.** The user saves and comes back later, downloads the project, or pushes it to a GitHub repository through a GitHub connection, where the workflow runs `azd provision` and `azd deploy`.

### Everything is versioned

Each project is one git tree: the board, the stage documents, the change log and the compiled files. Every accepted change is a commit with its actor (user, coach, compiler), its reason and its source. Approving a stage tags the tree. Compiling commits the generated files; a person's edit in the folder view is a commit by that person; compiling again shows a diff and never overwrites a person's edit silently. The audit trail in `docs/` is the log of that tree.

## Consequences

- The compiler can be built and tested headless, against stored boards, without the voice interface.
- The infrastructure team reviews Bicep it already trusts, the AI Landing Zone, with the system's own resources clearly marked on top.
- The wizard stays short because the stages did the work; a long wizard means a stage gate let something through.
- The same tree serves export, push and deploy, so there is one history from the first discovery question to the deployed resource.
- A Managed Application variant for reseller distribution is a later output format of the same compiler.
