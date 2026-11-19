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
| Specification | Well-Architected Framework, [Architecture design specification](https://learn.microsoft.com/azure/well-architected/architect-role/architecture-design-specification) and the [architect's checklist](https://learn.microsoft.com/azure/well-architected/architect-role/checklist) |

## The procedure

The coach works through these steps in order. `shared/board/readiness.ts` checks each one against the board, and every tool result tells the coach the first step that is not done (`next_step`).

### 1. Discovery and functional specification

Before designing, write down what the system must do and why. The functional specification details the what and the why of the system, not the implementation: the current problem, how the system improves it, and the business requirements. The design must then meet functional and nonfunctional requirements and be constrained by business, financial, compliance and organisational requirements (Specification). The build process asks for an agent charter covering business objectives, roles and prohibited actions (Build process).

The specification holds requirements of nine kinds: problem, outcome, user, scenario, functional, oversight (an action a person must approve, or something the system must never do on its own), nonfunctional (with its Well-Architected pillar), constraint and integration (a system or data it touches). Discovery covers eleven topics:

| Topic | Covered by | Before design |
|---|---|---|
| Problem, outcome, users | a problem, an outcome, a user | required |
| Scenarios | a scenario or functional requirement | required |
| Systems and data | an integration | required |
| Human oversight | an oversight requirement | required |
| Security and compliance | a security nonfunctional requirement or constraint | required |
| Reliability, cost, operations, performance | a nonfunctional requirement or constraint with that pillar | open topics become assumptions to confirm in the design specification |

Requirements come from what the user says in the session, the brief, or a pasted document such as a discovery call transcript, an RFP or notes.

**Enforced:** the change log refuses every design change until the brief has a goal and every required topic is covered (`shared/board/discovery.ts`). Every requirement and every design change must quote its source; the quote is checked against the brief, the user's own words or the named document (`server/guard/provenance.ts`). The specification can be read and exported as Markdown in the app.

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
| Approvals scoped to a tool | The approval sits on the path from the agent to the tool it gates |
| Legend | Under the drawing, listing only the styles in use |

The context view and the deployment view, with official Azure service names and icons, come with the compiler (ADR 0003): the deployment view is a drawing of what Compile produces.
