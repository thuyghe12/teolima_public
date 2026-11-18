# Teolima

A voice-first studio for designing multi-agent systems. You describe the system out loud; a coach on the Gemini Live API talks it through with you and sketches the architecture on a hand-drawn whiteboard as you speak: intake, router, specialist agents, tools, guardrails, memory and human approval gates.

![Demo session: a customer support system sketched by the coach](docs/demo.png)

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
Browser                         Server (Express + ws)               Gemini Live API
mic PCM 16 kHz  ── /ws/live ──▶ origin + token check  ── audio ──▶  speech in, speech out
canvas engine   ◀── tool_call ─ validate tool args    ◀── tools ──  draw_agent_node, draw_connection, ...
speaker 24 kHz  ◀── audio ──── session + idle caps     ◀── audio ──
                                web_search (grounded, wrapped as untrusted data)
```

1. The browser streams microphone audio to the server over a websocket. The API key never leaves the server.
2. The server holds the Live API session. The model speaks and calls drawing tools: 14 function declarations covering agent nodes, connections, callouts, diagrams, charts, sketches and search.
3. Every tool call is validated on the server before it reaches the browser (allowlisted tool names, clamped coordinates, parsed colours, capped text and arrays).
4. The canvas engine animates each call with rough.js. The server keeps a record of what is on the board and returns it inside each tool result, so the model connects to existing components by name and never draws one twice.
5. Drawing tools are non-blocking on models that support it: the model keeps talking while a component is drawn, and drawing results never start a new turn.

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Security

| Concern | Control |
|---|---|
| Key exposure | Key stays server-side; the browser talks only to this server |
| Unwanted clients | Origin allowlist on the websocket; optional `ACCESS_TOKEN` for hosted demos |
| Runaway cost | Connection cap, hard session limit, idle timeout, per-IP rate limit on image generation |
| Malformed or hostile tool calls | Server-side validation of every tool call and argument |
| Prompt injection through search | Search results passed to the model as untrusted reference data |
| Generated SVG | Rendered onto the canvas as an image, so embedded scripts never run |
| Oversized input | 200 KB JSON limit, 4 MB websocket frames, goal and file context truncated |

All limits are configurable in `.env` (see `.env.example`).

## Project layout

```
server.ts              Express app, websocket bridge, Live API session, tool declarations
server/config.ts       Environment configuration and limits
server/security.ts     Origin and token checks, rate limiter
server/validation.ts   Tool-call validation
server/demo.ts         Recorded session for demo mode
src/lib/canvas/        Canvas engine and hand-drawn renderer
src/lib/audio/         Microphone capture and playback
src/components/        Whiteboard, toolbar, call HUD, goal setup, history
tests/                 node:test suites
docs/                  Architecture, roadmap, decision records, verified Azure targets
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Server with hot reload on port 3000 |
| `npm test` | Unit tests (validation and demo replay) |
| `npm run lint` | TypeScript typecheck |
| `npm run build` | Production build of client and server into `dist/` |
| `npm start` | Run the production build |

CI runs typecheck, tests and build on every push and pull request.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | none | Live coaching. Without it, demo mode |
| `GEMINI_LIVE_MODEL` | `gemini-3.8-live` | Speech-to-speech model, with asynchronous tool calls |
| `GEMINI_LIVE_FALLBACK_MODEL` | `gemini-3.1-flash-live-preview` | Used if the primary model cannot be reached |
| `GEMINI_TEXT_MODEL` | `gemini-3.7-flash` | Search grounding and SVG sketches |
| `GEMINI_IMAGE_MODEL` / `GEMINI_IMAGE_LITE_MODEL` | `gemini-3.1-flash-image` / `gemini-3.1-flash-lite-image` | Sketch illustrations |
| `ALLOWED_ORIGINS` | `http://localhost:PORT` | Browser origins allowed on the websocket |
| `ACCESS_TOKEN` | none | Required token for hosted demos (`?token=...`) |
| `MAX_CONNECTIONS`, `SESSION_MAX_MINUTES`, `IDLE_TIMEOUT_SECONDS` | 20, 15, 120 | Cost and abuse limits |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | none | Saved sessions in Supabase; otherwise kept in the browser |

## License

All rights reserved.
