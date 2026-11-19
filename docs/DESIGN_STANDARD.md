# Design standard

Teolima designs multi-agent systems the way Microsoft's own guidance says to design them. Microsoft publishes no single notation for multi-agent systems, so this standard combines the guidance that exists into one procedure the coach follows and the server checks. Every rule below names its source. Where the code enforces a rule, the check is named too.

## Sources

| Short name | Source |
|---|---|
| Orchestration patterns | Azure Architecture Center, [AI agent orchestration patterns](https://learn.microsoft.com/azure/architecture/ai-ml/guide/ai-agent-design-patterns) |
| AI agent adoption | Cloud Adoption Framework, [AI agent adoption: decision tree and architecture](https://learn.microsoft.com/azure/cloud-adoption-framework/ai-agents/#ai-agent-decision-tree-and-architecture) |
| Operational standards | Cloud Adoption Framework, [Operational standards for AI agents](https://learn.microsoft.com/azure/cloud-adoption-framework/ai-agents/operational-standards) |
| Agent Framework | Microsoft Learn, [Agent Framework orchestrations](https://learn.microsoft.com/agent-framework/workflows/orchestrations) |
| Reference architecture | Microsoft, [Multi-Agent Reference Architecture](https://microsoft.github.io/multi-agent-reference-architecture/) |
| Baseline | Azure Architecture Center, [Baseline Microsoft Foundry chat reference architecture](https://learn.microsoft.com/azure/architecture/ai-ml/architecture/baseline-microsoft-foundry-chat) |
| Diagrams | Well-Architected Framework, [Architecture design diagrams](https://learn.microsoft.com/azure/well-architected/architect-role/design-diagrams) |
| Discovery | Well-Architected Framework, [Align technical strategy with business requirements](https://learn.microsoft.com/azure/well-architected/architect-role/design-business-requirements) |
| Specification | Well-Architected Framework, [Architecture design specification](https://learn.microsoft.com/azure/well-architected/architect-role/architecture-design-specification) and the [architect's checklist](https://learn.microsoft.com/azure/well-architected/architect-role/checklist) |
| arc42 | [arc42](https://docs.arc42.org/home/), the open template for architecture documentation: twelve sections from introduction and goals to risks and glossary |
| C4 | [The C4 model](https://c4model.com/) by Simon Brown: system context, container, component and code diagrams, with dynamic and deployment views alongside |

Microsoft links are checked against the guidance snapshot by `tests/discovery.test.ts` and `tests/design-standard.test.ts`, except Agent Framework, which is a separate doc set.

## Stages

The architect chooses diagram types that match the message, the audience and the lifecycle stage, and discloses progressively: a context diagram first, then more detailed views (Diagrams). Teolima works in four stages, each with its own people in the room, its own diagram and its own gate (`shared/board/stages.ts`):

| Stage | For | Draws | Approved by |
|---|---|---|---|
| 1. Discovery | Business sponsor, product owner, presales architect | Context diagram: the system as one box, its users, the systems and data it touches. Plus the functional specification | Business sponsor |
| 2. Solution design | Architect and the client's tech lead | High-level design: agents, teams, tools, knowledge, memory, guardrails, approvals and flow | Architect |
| 3. Technical design | Platform, security and operations engineers | Deployment diagram and design specification (not built yet) | Security and platform leads |
| 4. Compile | Delivery engineer | The deployment package (not built yet) | Delivery owner |

Each stage draws in its own frame, below the one before, so an approved stage stays readable above the one being worked on.

**Enforced:** each stage accepts only its own changes; an approved stage is frozen until the user reopens it, and reopening it drops the approvals of every later stage. Only the user can approve or reopen a stage, in the app, and only once the stage's gate is met: the change log refuses an approval from the coach or a worker. The approval records who approved and when.

## The procedure

The coach works through these steps in order. `shared/board/readiness.ts` checks each one against the board, and every tool result tells the coach the first step that is not done (`next_step`).

### 1. Discovery and functional specification

Before designing anything, create clarity about what the system must achieve, who it serves and which constraints it operates within (Discovery). The coach follows Microsoft's discovery steps: listen to what is asked and treat early asks as requests rather than requirements; probe why, until the real motivation shows; clarify requests into concrete, measurable requirements per user flow, including implicit ones such as data residency, security standards and retention; evaluate the constraints and trade-offs that bound the solution, without choosing technology yet. The fifth step, recommend, is the solution strategy of stage 2.

The outcome is a functional specification: what the workload must achieve and why, with measurable success criteria, what is in and out of scope, user flows with their errors and exceptions, requirements for accessibility, compliance, performance, privacy and security, and a rollout strategy (Discovery, "Expected outcome"). Teolima records it in arc42 sections 1 to 3 (`shared/board/arc42.ts`):

| Section | Holds |
|---|---|
| 1.1 Requirements overview | Goals, success metrics, user flows, requirements, what needs a person, assumptions still to verify |
| 1.2 Quality goals | Measurable qualities, each with its attribute: reliability, security, privacy, compliance, performance, cost, operations, accessibility |
| 1.3 Stakeholders | Each role and what it expects |
| 2 Constraints | Budget or timeline, regulatory, technical, organizational |
| 3.1 Scope | In scope, out of scope, rollout |
| 3.2 Business context | Each person and external system, with what it exchanges with the system. This draws the C4 system context diagram |

Discovery is ready for approval when these topics are covered: goals, success metrics, user flows, human oversight, security, privacy and compliance, stakeholders, scope, and the people and systems around it. Out of scope, reliability, performance, cost, operations and rollout may stay open; the technical design confirms them as stated assumptions (`shared/board/discovery.ts`). Items come from what the user says in the session, the brief, a pasted document (a discovery call transcript, an RFP, notes), or what the user types in the document; the user can also add sections of their own.

**Enforced:** every item the coach records quotes its source, and the quote is checked against the brief, the user's own words or the named document (`server/guard/provenance.ts`); what the user types is marked as theirs. Each section accepts only its own item types, with the name, attribute or category they need. Design changes are refused until the user approves discovery.

### 2. One agent or several

Use the lowest level of complexity that reliably meets the requirements: a direct model call, then a single agent with tools, then multi-agent orchestration. A single agent with tools is often the right default for enterprise use cases, and several agents are justified when one agent cannot reliably handle the task because of prompt complexity, tool overload or security requirements (Orchestration patterns). Start with several agents when the use case crosses security and compliance boundaries, involves multiple teams, or is expected to grow; otherwise test a single agent first (AI agent adoption).

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

Route deterministically where the right agent can be picked from the input, and define agents in code where routing must be controlled (Orchestration patterns, "Deterministic routing"); Agent Framework workflows give explicit control over multi-agent execution paths (Agent Framework).

**Enforced:** team members must be agents on the board and belong to one team; handoff teams name a start agent and group chat and magentic teams name a manager, or the change log warns. Readiness reports agents left outside a team.

### 4. Tools and knowledge

Design agents and their orchestrators to follow the principle of least privilege, and trim what every agent returns to what the user may see (Orchestration patterns, "Security").

**Enforced:** an agent can only reference tools and knowledge that are on the board. Readiness reports agents with neither and tools or knowledge no agent uses.

### 5. Guardrails

Apply content safety guardrails at multiple points: user input, tool calls, tool responses and final output, and design audit trails to meet compliance requirements (Orchestration patterns, "Security"). Organizations set a baseline of runtime safeguards, with stronger ones for agents exposed to untrusted information or taking consequential actions (Operational standards).

**Enforced:** readiness requires every agent to be covered by a guardrail that includes Prompt Shields. A guardrail compiles to a Foundry guardrail (see [BOARD_MODEL.md](BOARD_MODEL.md)).

### 6. Human approvals

Identify which points require human input, whether it is mandatory, and whether it approves or loops back for refinement; scope approval gates to specific tool invocations rather than whole agent outputs, so low-risk actions proceed on their own (Orchestration patterns, "Human participation"). Agents that perform consequential actions need additional review and testing (Operational standards).

**Enforced:** an approval must gate a tool or agent on the board, with a condition ("always" unless the user states one). Readiness keeps the step open until the user has confirmed whether any tool takes a high-impact action.

### 7. Where work enters and leaves

Show where work comes from and where results go, so the system has an explicit boundary (Diagrams: context diagrams need an explicit boundary).

**Enforced:** readiness requires at least one trigger and one output.

### 8. Evaluation

Agent outputs are nondeterministic, so integration tests use scoring rubrics or language-model-as-judge evaluations rather than exact-match assertions (Orchestration patterns, "Observability and testing"). Every production agent has acceptance thresholds approved by its business owners, an action-taking agent shows it respects approval boundaries, and agents that access sensitive information or take consequential actions get risk-based testing, including adversarial testing (Operational standards).

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
