# Architecture

## Components

```mermaid
flowchart LR
  subgraph Browser
    MIC[Audio manager<br/>mic 16 kHz PCM, speaker 24 kHz]
    UI[Whiteboard + call HUD]
    ENG[Canvas engine<br/>rough.js renderer]
  end
  subgraph Server
    WS[/ws/live bridge/]
    SEC[Origin, token, caps]
    VAL[Tool-call validation]
    DEMO[Demo replay]
    BOARD[Board session + change log]
  end
  LIVE[(Gemini Live API)]
  DOCS[(Microsoft Learn MCP server)]
  SB[(Supabase, optional)]

  MIC -- audio --> WS
  WS --> SEC --> LIVE
  LIVE -- board tools --> BOARD -- board --> ENG
  LIVE -- explain tools --> VAL -- tool_call --> ENG
  LIVE -- audio --> WS -- audio --> MIC
  BOARD -- search_microsoft_docs --> DOCS
  DEMO -- changes --> BOARD
  UI -- saved sessions --> SB
```

## The tool loop

1. On **Start call** the browser opens `/ws/live`. The upgrade is refused unless the origin is allowlisted, the access token matches (when one is configured) and the server is below its connection cap.
2. The server opens a Live API session with the coach prompt (`server/prompts/coach.ts`, versioned) and its tools, and relays microphone audio in and speech out.
3. Nothing is built before the brief has a goal: the user can write it in the app before the call (sent with `start_call` and saved as the user's change), or the coach asks for it and saves it with `set_brief`. The session opens with one instruction built from the brief (`openingPrompt`). The change log refuses every building change until a goal exists.
4. The coach's main tools edit the board model (`server/board-tools.ts`): `set_title`, `add_component`, `remove_component`, `set_team`, `remove_team`, `connect`, `disconnect`. Each call becomes a change for the session's board (`shared/board/changes.ts`) with actor `coach` and the reason the model gives, and is logged on the server. Only the user can clear the board: the toolbar sends a change with actor `user`.
5. An accepted change updates the board, which is sent to the browser (`board` message). The tool result returns a compact summary of the whole board, so the model always works from the real state. A refused change returns the reason and the board.
6. The browser keeps the latest board and hands it back when a new call starts, so ending a call, a reconnect or a session limit never wipes the design.
7. The browser lays the board out (`shared/board/layout.ts`), turns the layout into canvas elements with stable ids (`src/lib/canvas/boardElements.ts`) and syncs them (`syncBoardElements`): new elements animate in, changed ones update in place, and the view zooms out only when the board no longer fits.
8. Three tools inform or explain rather than build: `search_microsoft_docs` (the official Microsoft Learn MCP server's documentation search, `server/microsoft-docs.ts`; the prompt requires it before any Microsoft-specific advice), and `draw_callout` and `highlight_area` (a note or highlight on the board). The coach has no web search, image generation or free drawing. Drawing arguments are validated (`server/validation.ts`) before they reach the browser.
9. On Live models with asynchronous function calling, every tool is declared non-blocking (`server/live-tools.ts`): board and drawing results return SILENT, so the coach keeps narrating; documentation results return WHEN_IDLE. Nothing about the board is ever sent to the model as a new message, which would start a new turn.
10. The session ends on **End call**, at the session limit or after the idle timeout.

## Layout model

The layout is computed from the board, never chosen by the model. Left to right: triggers, then a guardrails lane above one container per team, then outputs. Inside a team, agents are placed by orchestration pattern:

| Pattern | Placement |
|---|---|
| Sequential | a row, in execution order, each passing to the next |
| Concurrent | a column, fanned out from the team input and back in |
| Handoff | the start agent on the left, the agents it hands off to on the right |
| Group chat, Magentic | the manager on top, participants in a row below |

The tools, knowledge and approvals a team uses sit in a lane below its agents, each approval next to what it gates. Connections are routed orthogonally through the gaps between columns. Tests check that no two cards overlap and that no connector crosses a card it does not connect.

## Demo mode

Without `GEMINI_API_KEY`, starting a call replays `server/demo.ts`: a goal, narration and the board changes for a customer support system. The replay goes through the same board session and change log as a live session, so it exercises the real path. The tests check that every change is accepted, that the design contains a guardrail and an approval, and that the board lays out cleanly.

## Persistence

Sessions (goal, transcript, canvas elements) are saved to a Supabase `call_sessions` table when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set, and to browser storage otherwise. The roadmap moves the board itself into a versioned tree; see [ROADMAP.md](ROADMAP.md).

## Security model

See the table in the [README](../README.md#security). The main design choice is that the browser never talks to the model provider: the server is the only party holding credentials, and it treats both the model's tool calls and search results as untrusted input.
