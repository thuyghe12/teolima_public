# Board model

The board is a typed document (`shared/board/schema.ts`). Every element maps onto something the compiler will emit for Microsoft Agent Framework and Foundry, so a design that is valid on the board is never ambiguous at compile time. The board holds no coordinates; layout is computed from it.

## The brief

Every board carries a brief: the goal, who uses the system, and the constraints the user stated. The change log refuses every building change while the goal is empty, so nothing is designed before the purpose is known, and every element can be traced back to the brief or to something the user said.

## One agent or several

Every board records whether the design is one agent with tools or several agents (`shape`), and for several, the reasons from Microsoft's guidance that justify them: `security_or_compliance_boundary`, `multiple_teams`, `future_growth`, `prompt_complexity`, `tool_overload`. The change log refuses a second agent or a team until the shape is `multi`. Clearing the board resets the shape. See [DESIGN_STANDARD.md](DESIGN_STANDARD.md) for the full procedure and `shared/board/readiness.ts` for the checks.

## Elements

Every element has one compile meaning: the file it lands in and the exact construct it becomes in Agent Framework, Foundry or Azure. The board stays at system level; the meaning below is what makes it unambiguous. ADR 0005 records this rule.

| Board element | Fields | Compiled to |
|---|---|---|
| **Agent** | name, description, instructions, model, tools, knowledge, memory, history | `agents/<name>.yaml`: a declarative agent (`kind: Prompt` with `name`, `description`, `instructions`, `model`) ([declarative agents](https://learn.microsoft.com/agent-framework/agents/declarative)), plus an `azure.ai.agent` service in `azure.yaml` ([azure.yaml reference](https://learn.microsoft.com/azure/foundry/agents/concepts/azure-yaml-reference)) |
| **Model** (agent field) | deployment name | A model deployment owned by the `azure.ai.project` service in `azure.yaml`; left empty, the compile wizard asks |
| **History** (agent field) | `service` or `client` | `service`: Foundry keeps the conversation (Foundry conversations). `client`: an Agent Framework chat history provider in the application; the In-Memory provider is released, the Cosmos DB and Redis providers are in preview ([integrations](https://learn.microsoft.com/agent-framework/integrations/)) |
| **Memory** | name, scope (`user` or `session`), store (`foundry_memory` or `cosmos_db`) | `foundry_memory`: Foundry Agent Service memory, in preview ([agent memory](https://learn.microsoft.com/azure/ai-foundry/agents/concepts/agent-memory)). `cosmos_db`: an Agent Framework context provider over Azure Cosmos DB ([Cosmos DB agent memory](https://devblogs.microsoft.com/cosmosdb/native-agent-memory-for-microsoft-agent-framework-powered-by-azure-cosmos-db/)), with the Cosmos DB account in Bicep |
| **Tool** | name, type, endpoint | A tool on each agent that uses it, typed by the Foundry tool catalog: function, MCP, OpenAPI, web search, code interpreter, file search, agent-to-agent (A2A) ([tool catalog](https://learn.microsoft.com/azure/foundry/agents/concepts/tool-catalog)) |
| **Knowledge** | name, source (AI Search, file search, web) | The Azure AI Search, file search or web search tool on each agent that uses it; for AI Search, the search service and its project connection in Bicep |
| **Team** | name, pattern, members (ordered), manager, start agent, purpose | `workflows/<team>.yaml`: an Agent Framework workflow using the orchestration for its pattern. Workflows connect executors through edges and conditions ([workflows](https://learn.microsoft.com/agent-framework/concepts/workflows/)); declarative workflows load the same graph from YAML ([declarative workflows](https://learn.microsoft.com/agent-framework/workflows/declarative)), and Foundry's workflow designer opens it ([Foundry workflows](https://learn.microsoft.com/azure/foundry/agents/concepts/workflow)) |
| **Guardrail** | name, controls, agents covered (empty = all) | A Foundry guardrail (an RAI policy, an ARM resource) in Bicep, attached to those agents |
| **Approval** | name, gated tool or agent, condition | Tool approval on the gated tool, or a human-in-the-loop step before the gated agent |
| **Trigger** | name, source (chat, API, schedule, event) | Where work enters: the agent or workflow endpoint for chat and API; the host for schedules and events |
| **Output** | name, destination (chat, API, email, Teams, storage) | Where results go |
| **Connection** | from, to, label | Data flow between components or teams; inside a team, the workflow's edges |

The exact YAML for tools and approvals is fixed in the compiler change and checked by loading every compiled package with Microsoft's own declarative loader in CI.

### Orchestration patterns

A team uses one of the five orchestration patterns built into Agent Framework ([Microsoft Learn](https://learn.microsoft.com/agent-framework/workflows/orchestrations)):

| Pattern | Agents | Board rule |
|---|---|---|
| Sequential | run one after another in a defined order | members are listed in execution order |
| Concurrent | run in parallel | none |
| Handoff | transfer control to each other based on context | needs a start agent, at least two members |
| Group chat | collaborate in a shared conversation | needs a manager, at least two members |
| Magentic | a manager agent coordinates specialised agents | needs a manager, at least two members |

Orchestrations support human-in-the-loop through tool approval and request info ([Microsoft Learn](https://learn.microsoft.com/sl-si/agent-framework/workflows/orchestrations)), which is what an approval element compiles to.

### Guardrail controls

`prompt_shields`, `harm_filters`, `groundedness` and `protected_material`: the built-in controls Foundry lists as Prompt Shields, harm and risk filters, groundedness checks and protected material detection ([Microsoft Azure blog](https://azure.microsoft.com/en-us/blog/?p=46280)). A guardrail is an RAI policy in Azure Resource Manager ([Microsoft Learn](https://learn.microsoft.com/en-us/azure/foundry/guardrails/how-to-create-guardrails)), so the compiler can emit it in the same Bicep as the rest.

## Changes

Nothing edits the board directly. Every edit is a change (`shared/board/changes.ts`) with:

- **body:** one of `set_brief`, `set_shape`, `set_title`, `clear`, `upsert_component`, `remove_component`, `upsert_team`, `remove_team`, `connect`, `disconnect`
- **actor:** `coach`, `user`, or a named memory worker (`worker:<name>`)
- **reason:** why, in a sentence
- **basis:** for coach changes that add to the design, what it rests on: `brief` or `user`, and the exact words quoted. The guard checks the quote before the change is applied (`server/guard/provenance.ts`)
- **at:** a timestamp

`applyChange` returns the next board or refuses with a reason the caller can act on; a refused change leaves the board untouched. The same list of changes always replays to the same board, which is what lets the change log become git commits later (ADR 0001).

### Rules the model enforces

- Names resolve to stable ids (`Refund Agent` becomes `refund-agent`), so adding the same name twice updates one element.
- A name cannot be reused for a different kind, or for both a team and a component.
- References must exist and have the right kind: an agent's tools must be tools, an approval gates a tool or an agent, team members are agents.
- An agent belongs to one team at most.
- Removing an element removes what depends on it: its connections, its team membership, references from agents and guardrails, and approvals that gated it.
- Pattern requirements that can be completed later (a manager, a start agent) are returned as warnings, not refusals, so a design can be built up step by step.

The tests in `tests/board.test.ts` cover each rule; `tests/fixtures/support-board.ts` builds a complete customer support system through changes only.

## Layout

`shared/board/layout.ts` computes positions from the board: triggers on the left, a guardrails lane above one container per team, outputs on the right. Agents are placed by their team's pattern, resources in a lane below them, and connectors are routed orthogonally around the cards. See [ARCHITECTURE.md](ARCHITECTURE.md#layout-model).
