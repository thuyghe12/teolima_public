# Board model

The board is a typed document (`shared/board/schema.ts`). Every element maps onto something the compiler will emit for Microsoft Agent Framework and Foundry, so a design that is valid on the board is never ambiguous at compile time. The board holds no coordinates; layout is computed from it.

## The brief

Every board carries a brief: the goal, who uses the system, and the constraints the user stated. The change log refuses every building change while the goal is empty, so nothing is designed before the purpose is known, and every element can be traced back to the brief or to something the user said.

## Elements

| Board element | Fields | Compiled to |
|---|---|---|
| **Team** | name, pattern, members (ordered), manager, start agent, purpose | An Agent Framework orchestration |
| **Agent** | name, instructions, model, tools, knowledge | An Agent Framework agent, deployed as a hosted agent |
| **Tool** | name, type (function, MCP, OpenAPI, web search, code interpreter, file search), endpoint | A tool on the agents that use it |
| **Knowledge** | name, source (AI Search, file search, web) | A grounding source and its project connection |
| **Guardrail** | name, controls, agents covered (empty = all) | A Foundry guardrail on those agents |
| **Approval** | name, gated tool or agent, condition | A human approval step before the gated action |
| **Trigger** | name, source (chat, API, schedule, event) | Where work enters the system |
| **Output** | name, destination (chat, API, email, Teams, storage) | Where results go |
| **Connection** | from, to, label | Data flow between components or teams |

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

- **body:** one of `set_brief`, `set_title`, `clear`, `upsert_component`, `remove_component`, `upsert_team`, `remove_team`, `connect`, `disconnect`
- **actor:** `coach`, `user`, or a named memory worker (`worker:<name>`)
- **reason:** why, in a sentence
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
