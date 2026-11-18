# ADR 0003: Compile the board to an Azure AI Foundry deployment package

**Status:** Accepted, not yet implemented. Targets verified in [AZURE_TARGETS.md](../AZURE_TARGETS.md).

## Context

A design session currently ends with a picture. To be useful to a team, it has to end with something that can be reviewed and deployed. Azure AI Foundry is the first and only target for v1.

## Decision

**Compile** reads the board document (ADR 0001) and produces a package:

```
infra/main.bicep, infra/main.parameters.json   Foundry resource, project, model deployments,
                                               capability hosts, connections, role assignments
azure.yaml                                     project service plus one agent service per agent node
agents/<name>/                                 instructions and tool configuration per agent
README.md                                      what will be deployed, assumptions, how to deploy
```

1. **Mapping.** Each node type maps to resources: agent nodes to agent definitions and model deployments; knowledge nodes to AI Search and its connection; memory nodes to the agent state stores; guardrail nodes to content safety configuration; human approval nodes to an approval step in the agent definition. Unmapped nodes are reported, never silently dropped.
2. **Defaults.** Networking, private endpoints, identity and monitoring come from the AI Landing Zone, which is built on Azure Verified Modules.
3. **Assumptions.** A dedicated agent compares the board with what the package needs and lists only the open assumptions (region, naming prefix, model choices, network isolation, tier). The wizard asks those; everything else sits behind an Advanced section.
4. **Review.** Before download, the user sees the generated files, a plain-language summary of every resource, and anything that cannot be changed after deployment (capability hosts in particular).
5. **Validation.** The package must pass `bicep build` and lint; CI compiles every eval board.

## Consequences

- The compiler can be built and tested headless, against stored boards, without the voice interface.
- Agent definitions live next to the Bicep, matching how the Azure Developer CLI deploys Foundry agents.
- A Managed Application variant for reseller distribution is a later output format of the same compiler.
