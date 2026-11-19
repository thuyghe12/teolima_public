# Teolima

A voice-first studio for designing multi-agent systems for Microsoft Agent Framework and Azure AI Foundry. You give a short brief and talk the design through with a coach on the Gemini Live API. The coach builds it on a hand-drawn board as you speak: triggers, teams of agents in an orchestration pattern, tools, knowledge, guardrails and human approvals.

![Demo session: a customer support system built by the coach](docs/demo.png)

**Where it is going:** one unified git tree as the source of truth, many actors committing to it, two views of the same tree, and one compile target.

> You speak a multi-agent system into being. The coach, the memory workers and you all commit to one git tree, colour-coded by actor. Flip between the whiteboard and the code view of the same tree. Click Compile and it becomes a reviewed Azure AI Foundry deployment package: Bicep for the infrastructure, agent definitions for the agents.

The voice coach, the whiteboard and the hardening below are built. The unified tree, the memory workers and the compiler are designed in [docs/ROADMAP.md](docs/ROADMAP.md) with one decision record each.

## Try it

Requires Node 20 or later.

```bash
npm install
cp .env.example .env     # optional: add GEMINI_API_KEY for live coaching
npm run dev              # http://localhost:3000
```

Without a key, press **Start call** and the app replays a recorded design session through the same tool-call path a live session uses. With a key, allow the microphone and describe what you want to build, or pick a topic from **Ideas**.

## How it works

```
Browser                          Server (Express + ws)                  Gemini Live API
mic PCM 16 kHz  ── /ws/live ───▶ origin + token check   ── audio ────▶  speech in, speech out
                                 board session + change log ◀─ tools ─  add_component, set_team, connect, ...
canvas engine   ◀── board ────── validated board model
speaker 24 kHz  ◀── audio ────── session + idle caps     ◀── audio ────
```

1. The browser streams microphone audio to the server over a websocket. The API key never leaves the server.
2. Nothing is built before there is a brief: a goal, who uses the system, and its constraints. You can write it in the call panel before the call (recent briefs are one click away), or the coach asks for it and confirms it back. The server refuses every building change until the goal is saved.
3. The coach follows a written design standard anchored in Microsoft's guidance ([docs/DESIGN_STANDARD.md](docs/DESIGN_STANDARD.md)): brief, one agent or several, orchestration pattern, tools and knowledge, guardrails, human approvals, where work enters and leaves. One agent with tools is the default; the server refuses a second agent until a reason from the guidance is recorded.
4. The coach builds the design with tools that edit a typed board model (agents with their model, tools, knowledge, memory and conversation history; teams with an orchestration pattern; guardrails, approvals, triggers, outputs, connections), each with one exact compile meaning in Agent Framework, Foundry or Azure ([docs/BOARD_MODEL.md](docs/BOARD_MODEL.md)). It never draws shapes or chooses positions.
5. Every edit is a change with an actor and a reason, validated by the change log: names map to stable ids, so nothing is created twice, and references are checked by kind. A refused change tells the model why.
6. After each accepted change the server sends the board to the browser. The layout is computed from the board (`shared/board/layout.ts`): teams laid out by pattern, resources in a lane below, connectors routed around cards.
7. Before advising on anything specific to Agent Framework, Foundry, guardrails, evaluations or Azure resources, the coach searches Microsoft Learn through Microsoft's official documentation server and bases its advice on the excerpts.
8. Tools are non-blocking on Live models that support it, so the coach keeps talking while the board updates.

The board model and what each element compiles to: [docs/BOARD_MODEL.md](docs/BOARD_MODEL.md). Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Security

| Concern | Control |
|---|---|
| Key exposure | Key stays server-side; the browser talks only to this server |
| Unwanted clients | Origin allowlist on the websocket; optional `ACCESS_TOKEN` for hosted demos |
| Runaway cost | Connection cap, hard session limit, idle timeout |
| Malformed or hostile tool calls | Server-side validation of every tool call and argument |
| Invented or ungrounded designs | No building before a brief with a goal (change log); every building change must quote its basis, and the server checks the quote against the brief and the user's transcribed words (provenance); no web search, image generation or free drawing |
| Prompt injection | Gemini's jailbreak and harm filters are turned on (they are off by default); Prompt Shields screens the brief, typed messages, finished speech turns and documentation results; documentation keeps only Microsoft Learn links and is withheld if it cannot be screened; the brief and documents are passed as data, never as instructions |
| Instruction leaks | The coach's transcribed speech is checked for reciting its instructions |
| Accountability | Per-session audit trail of every guard decision and every accepted or refused change with its basis (`logs/audit`) |
| Oversized input | 200 KB JSON limit, 4 MB websocket frames, capped brief and typed messages |

The guard pipeline and its limits are described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#guard-pipeline). Speech reaches the model as audio, so a spoken turn is screened after the model has heard it: a flagged turn gets a notice to the model and to the user, and nothing it asks for can reach the board without passing provenance and the change log.

All limits are configurable in `.env` (see `.env.example`).

## Project layout

```
server.ts              Express app, websocket bridge, Live API session
server/config.ts       Environment configuration and limits
server/security.ts     Origin and token checks
server/validation.ts   Tool-call validation
server/guard/          Guard pipeline: provenance, Prompt Shields, audit trail
server/demo.ts         Recorded session for demo mode
server/board-tools.ts  The coach's board tools and per-session board
server/prompts/        Versioned coach prompt
server/knowledge.ts    Loads the guidance snapshot at startup
shared/board/          Typed board model, change log and layout (docs/BOARD_MODEL.md)
shared/knowledge/      Guidance snapshot: sources, parser, and the outline/page/section/find library
scripts/knowledge/     Builds the snapshot from Microsoft Learn and checks it
data/knowledge/        The snapshot: Microsoft's architecture guidance as pages and sections (CC BY 4.0)
src/lib/canvas/        Canvas engine and hand-drawn renderer
src/lib/audio/         Microphone capture and playback
src/components/        Whiteboard, toolbar, call panel with the brief, settings, history
tests/                 node:test suites
docs/                  Architecture, design standard, roadmap, decision records, verified Azure targets
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Server with hot reload on port 3000 |
| `npm test` | Unit tests (board model, layout, tools, validation, demo) |
| `npm run lint` | TypeScript typecheck |
| `npm run build` | Production build of client and server into `dist/` |
| `npm start` | Run the production build |
| `npm run check:docs` | Run one real Microsoft Learn search from this machine |
| `npm run knowledge:build` | Rebuild the guidance snapshot in `data/knowledge/` from Microsoft Learn |
| `npm run knowledge:verify` | Check the snapshot (page counts, sections, links, checklist items per pillar) |

CI runs typecheck, tests and build on every push and pull request. A weekly workflow rebuilds the guidance snapshot and proposes any change as a pull request.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | none | Live coaching. Without it, demo mode |
| `GEMINI_LIVE_MODEL` | `gemini-3.8-live` | Speech-to-speech model, with asynchronous tool calls |
| `GEMINI_LIVE_FALLBACK_MODEL` | `gemini-3.1-flash-live-preview` | Used if the primary model cannot be reached |
| `MICROSOFT_DOCS_MCP_URL` | Microsoft Learn MCP server | Documentation grounding for the coach; `off` disables it |
| `ALLOWED_ORIGINS` | `http://localhost:PORT` | Browser origins allowed on the websocket |
| `ACCESS_TOKEN` | none | Required token for hosted demos (`?token=...`) |
| `AZURE_CONTENT_SAFETY_ENDPOINT`, `AZURE_CONTENT_SAFETY_KEY` | none | Prompt Shields screening; off until both are set, and reported as off in the audit trail |
| `AUDIT_DIR` | `logs/audit` | Per-session audit trail; `off` disables it |
| `MAX_CONNECTIONS`, `SESSION_MAX_MINUTES`, `IDLE_TIMEOUT_SECONDS` | 20, 15, 120 | Cost and abuse limits |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | none | Saved sessions in Supabase; otherwise kept in the browser |

## License

All rights reserved.
