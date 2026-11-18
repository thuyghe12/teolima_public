# ADR 0005: A high-level board with an exact compile meaning

**Status:** Accepted. Model in place; the compiler (ADR 0003) implements the meanings.

## Context

The board showed agents, tools, teams and approvals as Teolima's own simplifications. A senior architect checks a design against how Agent Framework and Foundry represent a system: per agent its model, instructions, tools, conversation history and memory; across agents the workflow of executors and edges; around them the Azure resources that make it run. A board that cannot answer those questions is not credible, and a compiler reading it would have to guess.

Two ways to fix it were considered:

1. **Model the implementation directly.** Put Agent Framework executors, edges and Foundry settings on the board, edited with a node editor. Foundry already has a visual workflow builder with a synchronised YAML view, so this would compete with a free Microsoft tool at its own level, and it would lose what this board is for: explaining a system to people who do not code.
2. **Keep the board at system level, and give every element one exact compile meaning.** The board stays readable for a domain expert. Each element maps to a named construct in Agent Framework, Foundry or Azure, documented with its source, so the design is unambiguous and the compiler never guesses.

## Decision

Option 2.

- Every element and field has one compile meaning, listed in [BOARD_MODEL.md](../BOARD_MODEL.md) with a link to the Microsoft documentation it comes from.
- What a system needs per agent is on the board: model deployment, tools, knowledge, memory and where conversation history lives. Memory is an element of its own (per user or per conversation, Foundry memory or Azure Cosmos DB); history is `service` (Foundry) or `client` (an Agent Framework chat history provider).
- Tool types follow the Foundry tool catalog, including agent-to-agent (A2A).
- Nothing on the board is filled in by inference. Values the user has not given (a model name, an endpoint) stay empty and become questions in the compile wizard.
- The compiled package is an Azure Developer CLI project: `azure.yaml`, Bicep for the resources, one declarative agent per agent and one declarative workflow per team. Agent definitions are not Bicep resources, so the package, not a single Bicep file, is the unit of deployment.
- Teolima hands off to Microsoft's tools: a compiled workflow opens in Foundry's workflow designer and in VS Code.

## Consequences

- The board answers an architect's questions per agent and across agents, without becoming an implementation editor.
- The code side of the board/code toggle can show exactly what Compile would produce, element by element.
- Where Microsoft's features are in preview (Foundry memory, some chat history providers), the board model says so, and the compile wizard will too.
- Adding a construct means adding its compile meaning and source in the same change.
