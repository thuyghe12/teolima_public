# ADR 0006: Microsoft's guidance as a versioned snapshot, read by progressive disclosure

**Status:** Accepted. Build, check, library and weekly refresh in place; the coach and the specialist workers use it next.

## Context

Teolima's designs have to follow Microsoft's own guidance, and say where each decision comes from: the Well-Architected Framework (the architect role, the five pillars and their design review checklists), the AI section of the Azure Architecture Center, and the AI agents section of the Cloud Adoption Framework. The coach can already search Microsoft Learn live, but a live search returns whatever ranks highest that day, and nothing can be checked later against what it said.

The specialist workers planned for the board (network, identity, memory, tools, observability and so on) each need a narrow part of that guidance, the exact text behind a decision, and a link a reviewer can open.

Three designs were considered:

1. **Vector search in a database.** Chunk the pages, embed them, store them in Postgres with pgvector, and retrieve by similarity. A first version was built on Supabase. Embedding inside Edge Functions ran into their CPU limit, the built-in embedding model was flagged as a candidate for deprecation, and the design needed a database, scheduled jobs, secrets and an embedding provider before anyone could run the app.
2. **Live lookups only.** Navigate and fetch Microsoft Learn on demand through its MCP server. Always current, but every answer depends on the network, and a quote cannot be checked against a fixed text.
3. **A versioned snapshot of the structure and the text, read by progressive disclosure.** The guidance is a few hundred pages that Microsoft has already organised: a table of contents, headings on every page, coded checklist items. Keep that structure, keep the text of each section, and let agents move down it.

## Decision

Option 3.

- `npm run knowledge:build` reads each source's table of contents (or, where the table of contents is too large to fetch reliably, starts from the section's hub page), fetches every page through the Microsoft Learn MCP server, and follows links between pages inside the source, because Microsoft Learn splits large tables of contents. It writes one JSON file per source to `data/knowledge/`: pages in table of contents order with their area and pillar, sections with their heading trail, link and text, and the design review checklist items.
- `npm run knowledge:verify` refuses a thin or broken snapshot: too few pages, an empty section, a repeated section id, a link outside its source, or a pillar without checklist items.
- The snapshot is committed. The app loads it at startup and needs no database or network for it. A weekly GitHub Action rebuilds it and proposes any change as a pull request, so a change in Microsoft's guidance is reviewed before Teolima uses it, and the diff shows exactly what changed.
- Agents read it in steps (`shared/knowledge/guidance.ts`): the outline of their area, then a page's headings, then one section. A keyword search over headings and text finds a term whose place is unknown. Every answer carries a Microsoft Learn link and the day its text was retrieved.
- A quote an agent cites is accepted only if it appears in the section it names (`quoted`). This is the check that will extend provenance from the brief and the transcript to Microsoft's guidance.
- The content is CC BY 4.0. The snapshot carries the attribution and says what was changed.

## Consequences

- Anyone can clone the repository, add a Gemini key and run it. Supabase stays optional, for saved boards.
- Lookups are deterministic and explainable: an agent opened "Well-Architected > Security > Networking" because that is where the answer is, not because of a similarity score.
- Each worker gets only its own part of the guidance, which keeps its context small and its citations relevant.
- Keyword search can miss a paraphrase that vector search would catch. The agents query in Microsoft's vocabulary, so this matters little; if an evaluation set shows misses, embeddings can be added on top of the same snapshot.
- The snapshot is a few megabytes of generated JSON in the repository. Rebuilds with no change on Microsoft Learn produce no diff.
- Pages outside the three sources are not in the snapshot. The live Microsoft Learn search stays available to the coach for those.
