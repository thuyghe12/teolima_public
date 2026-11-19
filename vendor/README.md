# Vendored sources

Third-party sources the compiler builds on, copied unchanged at a reviewed revision, each with its licence. They are repository-owned source, the way Microsoft's own Agent Landing Zone incorporates the AI Landing Zone foundation, not submodules.

| Folder | Source | Revision | Licence | Used for |
|---|---|---|---|---|
| `ai-landing-zone/` | [Azure/bicep-ptn-aiml-landing-zone](https://github.com/Azure/bicep-ptn-aiml-landing-zone) | `v2.7.3`, commit `97e2375b89dcda4900d75aac9e7ffb7b20cce165` | MIT | The `infra/` of every compiled project: `main.bicep`, `main.parameters.json`, `manifest.json`, `modules/`, `constants/` and the preflight hook `scripts/Invoke-PreflightChecks.ps1` |
| `azd-schemas/` | [Azure/azure-dev](https://github.com/Azure/azure-dev) | commit `1282883eb5e3e253cfc0a17e70f12cfea5f20b68` | MIT | Validating every compiled `azure.yaml`: `schemas/v1.0/azure.yaml.json` and the Foundry extension schemas (`azure.ai.agent`, `azure.ai.project`, `azure.ai.connection`, `azure.ai.routine`, `azure.ai.eval`, `azure.ai.skill`, `azure.ai.toolbox` and the files they reference) |

To move to a new revision, check out the upstream at that tag or commit, copy the same files over these folders, update this table, and run the tests: `tests/compile.test.ts` checks every parameter the compiler sets against the landing zone's own declarations, and every compiled `azure.yaml` against the schemas. CI then builds the compiled Bicep.
