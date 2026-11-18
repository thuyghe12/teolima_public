# Design standard

Teolima designs multi-agent systems the way Microsoft's own guidance says to design them. Microsoft publishes no single notation for multi-agent systems, so this standard combines the guidance that exists into one procedure the coach follows and the server checks. Every rule below names its source. Where the code enforces a rule, the check is named too.

## Sources

| Short name | Source |
|---|---|
| Orchestration patterns | Azure Architecture Center, [AI agent orchestration patterns](https://learn.microsoft.com/azure/architecture/ai-ml/guide/ai-agent-design-patterns) |
| Single or multiple agents | Cloud Adoption Framework, [Single agent or multiple agents](https://learn.microsoft.com/azure/cloud-adoption-framework/ai-agents/single-agent-multiple-agents) |
| Build process | Cloud Adoption Framework, [Process to build agents](https://learn.microsoft.com/azure/cloud-adoption-framework/ai-agents/build-secure-process) |
| Agent Framework | Microsoft Learn, [Agent Framework orchestrations](https://learn.microsoft.com/agent-framework/workflows/orchestrations) |
| Reference architecture | Microsoft, [Multi-Agent Reference Architecture](https://microsoft.github.io/multi-agent-reference-architecture/) |
| Baseline | Azure Architecture Center, [Baseline Microsoft Foundry chat reference architecture](https://learn.microsoft.com/azure/architecture/ai-ml/architecture/baseline-microsoft-foundry-chat) |
| Diagrams | Well-Architected Framework, [Architecture design diagrams](https://learn.microsoft.com/azure/well-architected/architect-role/design-diagrams) |

## The procedure

The coach works through these steps in order. `shared/board/readiness.ts` checks each one against the board, and every tool result tells the coach the first step that is not done (`next_step`).

### 1. Brief

Write down what the system must achieve, who uses it and what it must never do before designing anything. The build process asks for an agent charter covering business objectives, roles and prohibited actions (Build process).

**Enforced:** the change log refuses every building change until the brief has a goal. Every building change must quote its basis in the brief or in the user's own words (`server/guard/provenance.ts`).

### 2. One agent or several

Use the lowest level of complexity that reliably meets the requirements: a direct model call, then a single agent with tools, then multi-agent orchestration. A single agent with tools is often the right default for enterprise use cases, and several agents are justified when one agent cannot reliably handle the task because of prompt complexity, tool overload or security requirements (Orchestration patterns). Start with several agents when the use case crosses security and compliance boundaries, involves multiple teams, or is expected to grow; otherwise test a single agent first (Single or multiple agents).

**Enforced:** the board records the decision (`shape`: single or multi) and, for multi, at least one of five reasons: `security_or_compliance_boundary`, `multiple_teams`, `future_growth`, `prompt_complexity`, `tool_overload`. The change log refuses a second agent or a team until the shape is multi.

### 3. Orchestration pattern

Put cooperating agents in a team with one of the five patterns Agent Framework provides (Agent Framework), choosing the simplest that fits (Orchestration patterns):

| Pattern | Use when | Avoid when |
|---|---|---|
| Sequential | Stages build on each other in a fixed order | Stages could run in parallel, or routing depends on intermediate results |
| Concurrent | Independent work can run in parallel, or latency matters | Agents need each other's output, or there is no way to resolve conflicting results |
| Handoff | The right specialist only emerges during the work, one agent active at a time | The right agent can be picked from the input: use a deterministic router |
| Group chat | Decisions come from discussion or maker-checker review | A pipeline or simple delegation is enough, or there is no clear completion criterion |
| Magentic | Open-ended work with no predetermined path that needs a reviewable plan | The path is deterministic, the task is simple or time-sensitive |

Use deterministic workflows for critical business logic (Build process).

**Enforced:** team members must be agents on the board and belong to one team; handoff teams name a start agent and group chat and magentic teams name a manager, or the change log warns. Readiness reports agents left outside a team.

### 4. Tools and knowledge

Segment knowledge by role so each agent reaches only what it needs, define explicit tool boundaries, and keep integrations behind narrowly scoped APIs with least-privilege access (Build process).

**Enforced:** an agent can only reference tools and knowledge that are on the board. Readiness reports agents with neither and tools or knowledge no agent uses.

### 5. Guardrails

Apply content safety guardrails at input, tool calls, tool responses and final output, and keep audit trails (Orchestration patterns, Build process).

**Enforced:** readiness requires every agent to be covered by a guardrail that includes Prompt Shields. A guardrail compiles to a Foundry guardrail (see [BOARD_MODEL.md](BOARD_MODEL.md)).

### 6. Human approvals

Require a person to confirm high-impact actions such as database writes or financial transactions (Build process). Scope approval gates to specific tool invocations rather than whole agent outputs, so low-risk actions proceed on their own (Orchestration patterns).

**Enforced:** an approval must gate a tool or agent on the board, with a condition ("always" unless the user states one). Readiness keeps the step open until the user has confirmed whether any tool takes a high-impact action.

### 7. Where work enters and leaves

Show where work comes from and where results go, so the system has an explicit boundary (Diagrams: context diagrams need an explicit boundary).

**Enforced:** readiness requires at least one trigger and one output.

### 8. Evaluation

Evaluate with scoring rubrics or model-graded evaluations rather than exact matches, because outputs are not deterministic (Orchestration patterns), keep evaluations in a central catalog and run them in CI/CD, and red-team for prompt injection and system prompt extraction (Build process).

**Planned:** the compiler writes an evaluation set from the board's own rules (ADR 0003).

## Notation

The board follows the diagram guidance (Diagrams): directional arrows only, labels on lines whose meaning is not obvious, one consistent line style per kind of relationship, an explicit system boundary, a legend whenever borders or lines carry meaning, and official names for Microsoft services. The building blocks follow the reference architecture's split between agents, an orchestration layer, knowledge, and an integration layer for tools (Reference architecture). The deployment view follows the baseline Foundry architecture (Baseline).

On the board today (`shared/board/layout.ts`):

| Rule | How it is drawn |
|---|---|
| Explicit system boundary | A solid outline around everything the system contains; triggers and outputs sit outside it |
| One line style per relationship | Solid arrow: work flows. Dotted line: uses a tool or knowledge. Dashed arrow: needs a person to approve |
| Guardrails at every intervention point | A band across the system naming its controls and the agents it covers, instead of one more box |
| Approvals scoped to a tool | A diamond, the standard shape for a decision gate, on the path from the agent to the tool it gates |
| Different kinds of thing look different | Four visual families from the building blocks ([BLOCKS.md](BLOCKS.md)): agents, capabilities, governance, where work enters and leaves |
| Official names for Microsoft services | Every card names its Microsoft product or building block in full; preview features are marked |
| Legend | Under the drawing, listing only the shapes and styles in use |

The context view and the deployment view, with official Azure service names and icons, come with the compiler (ADR 0003): the deployment view is a drawing of what Compile produces.
