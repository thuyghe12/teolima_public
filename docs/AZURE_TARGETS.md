# Azure targets for the compiler

Verified against Microsoft documentation on 18 November 2026, before the compiler was written. The compiler does not generate these resources itself: it builds on the AI Landing Zone Bicep, which implements them, and on the azd schemas ([ADR 0003](adr/0003-compile-to-foundry-package.md)). This file records the facts the review checks against.

## Foundry resources in Bicep

| Resource | Type | Notes |
|---|---|---|
| Foundry resource | `Microsoft.CognitiveServices/accounts`, `kind: 'AIServices'` | Created with `allowProjectManagement: true` and a `customSubDomainName` |
| Project | `Microsoft.CognitiveServices/accounts/projects` | A child resource of the Foundry resource. The older hub model (`Microsoft.MachineLearningServices/workspaces`, kind `Hub`) is not used |
| Model deployment | `Microsoft.CognitiveServices/accounts/deployments` | One per model the agents use |

Source: [Automating Azure AI Foundry deployment with Bicep](https://techcommunity.microsoft.com/t5/azure-infrastructure-blog/automating-azure-ai-foundry-deployment-with-iac-leveraging-bicep/ba-p/4412155)

## Agent Service setup

- Capability hosts are sub-resources on both the account and the project. The account capability host has an empty properties section; the project capability host references the Cosmos DB, Storage and AI Search connections for a standard setup.
- A capability host cannot be updated after it is set. The compiler must get it right on first deploy, and the review step must show it.
- The project managed identity needs role assignments on dependent resources, for example Search Index Data Contributor and Search Service Contributor on AI Search.

Source: [Standard agent setup](https://learn.microsoft.com/azure/foundry/agents/concepts/standard-agent-setup)

## Agents are declared next to the infrastructure, not in it

Agent definitions are not Bicep resources. With the Azure Developer CLI, an `azure.yaml` declares an `azure.ai.project` service that owns the model deployments and `azure.ai.agent` services that depend on it.

Source: [azure.yaml reference](https://learn.microsoft.com/azure/foundry/agents/concepts/azure-yaml-reference)

**Consequence for the compiler:** its output is a package, not a single file:

```
infra/main.bicep         resource group contents: Foundry resource, project, deployments,
                         capability hosts, connections, role assignments
infra/main.parameters.json
azure.yaml               project service and one agent service per agent on the board
agents/<name>/           instructions and tool configuration per agent
README.md                what will be deployed, assumptions made, how to deploy
```

## Defaults: AI Landing Zone

The AI Landing Zone is Microsoft's reference architecture for secure AI apps and agents on Azure, with Portal, Bicep and Terraform implementations. The Bicep and Terraform implementations are built on Azure Verified Modules. It can be initialised with `azd init -t Azure/AI-Landing-Zones`.

Sources: [AI Landing Zones](https://azure.github.io/AI-Landing-Zones), [GitHub repository](https://github.com/Azure/AI-Landing-Zones), [Bicep how-to](https://azure.github.io/AI-Landing-Zones/bicep/how-to-use)

The compiler takes its defaults (networking, private endpoints, identity, monitoring) from the landing zone so the wizard only asks about what the board leaves open.

## Later: reseller distribution as a Managed Application

- A managed application definition is a `mainTemplate.json` (the resources) plus a `createUiDefinition.json` (the portal deployment screen).
- Bicep can be used to author it, but must be compiled to ARM JSON before publishing, and Managed Applications support only ARM `languageVersion` 1.0.
- An application's kind is `MarketPlace` or `ServiceCatalog`.

Sources: [Bicep managed application quickstart](https://learn.microsoft.com/en-ie/azure/azure-resource-manager/managed-applications/publish-bicep-definition), [Service catalog quickstart](https://docs.azure.cn/en-us/azure-resource-manager/managed-applications/publish-service-catalog-app), [Microsoft.Solutions/applications](https://learn.microsoft.com/azure/templates/microsoft.solutions/applications)
