# Guidance snapshot

Microsoft's architecture guidance, as Teolima's agents read it. One file per source:

| File | Source |
|---|---|
| `well-architected.json` | [Azure Well-Architected Framework](https://learn.microsoft.com/azure/well-architected/) |
| `architecture-center-ai.json` | [Azure Architecture Center: AI and machine learning](https://learn.microsoft.com/azure/architecture/ai-ml/) |
| `cloud-adoption-ai-agents.json` | [Cloud Adoption Framework: AI agents](https://learn.microsoft.com/azure/cloud-adoption-framework/ai-agents/) |

Each file holds the pages of its source in table of contents order. Every page has its place in the table of contents, its area and pillar, and its sections; every section has its heading trail, a link to that heading on Microsoft Learn, and its text. The design review checklist items (RE:01, SE:06, ...) are listed separately.

These files are generated. Do not edit them by hand: run `npm run knowledge:build`. A weekly GitHub Action rebuilds them and proposes any change as a pull request. See [ADR 0006](../../docs/adr/0006-guidance-snapshot.md).

## Attribution

Content from [Microsoft Learn](https://learn.microsoft.com), © Microsoft, licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). Changes made for Teolima: page markup removed and pages split into sections by heading. Each page records the day its text was retrieved.
