import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { config } from './server/config';
import { DEMO_GOAL, playDemo } from './server/demo';
import { BOARD_TOOLS, BoardSession, boardToolDeclarations, toChangeBody } from './server/board-tools';
import { ChangeBody } from './shared/board/changes';
import { COACH_PROMPT, COACH_PROMPT_VERSION, goalContextPrompt } from './server/prompts/coach';
import { declareTools, supportsAsyncTools, toolResponse } from './server/live-tools';
import { validateToolCall, wrapUntrustedSearch } from './server/validation';
import { guardSketchEndpoint, hasValidToken, isAllowedOrigin, tokenFromUpgrade } from './server/security';

const PORT = config.port;
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: config.httpBodyLimit }));

const server = http.createServer(app);
const wss = new WebSocketServer({
  server,
  path: '/ws/live',
  maxPayload: config.wsMaxPayloadBytes,
  verifyClient: ({ origin, req }, done) => {
    if (!isAllowedOrigin(origin)) return done(false, 403, 'Origin not allowed');
    if (!hasValidToken(tokenFromUpgrade(req))) return done(false, 401, 'Missing or invalid access token');
    if (wss.clients.size >= config.maxConnections) return done(false, 503, 'Server is at capacity');
    done(true);
  },
});

// Function declarations for Gemini Live Drawing Agent & Solutions Architect
const webSearchTool: FunctionDeclaration = {
  name: 'web_search',
  description: 'Search the live web for the latest multi-agent framework documentation (LangGraph, CrewAI, AutoGen, OpenAI Swarm, Google ADK, Model Context Protocol / MCP), APIs, vector databases, and enterprise architectural best practices before proposing solutions.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'The search query for technical architecture, tool specifications, or framework patterns'
      }
    },
    required: ['query']
  }
};

const highlightAreaTool: FunctionDeclaration = {
  name: 'highlight_area',
  description: 'Draw an eye-catching highlight loop or spotlight around a component or area to draw attention.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      targetNode: { 
        type: Type.STRING, 
        description: 'Optional component or node label to highlight (e.g. "User Intake", "Router", "Injury Risk Model", "Pinecone Vector DB"). When specified, automatically encircles that component.' 
      },
      x: { type: Type.NUMBER, description: 'X position on canvas' },
      y: { type: Type.NUMBER, description: 'Y position on canvas' },
      width: { type: Type.NUMBER, description: 'Width in pixels' },
      height: { type: Type.NUMBER, description: 'Height in pixels' }
    }
  }
};

const drawCalloutTool: FunctionDeclaration = {
  name: 'draw_callout',
  description: 'Draw a hand-drawn advice callout box with a crisp engineering tip or architectural trade-off.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING, description: 'Concise architectural advice or trade-off note (e.g. "💡 Evaluator-Optimizer loop catches 99% of formatting errors")' },
      attachToNode: { type: Type.STRING, description: 'Component name to attach callout to' },
      relativePosition: { type: Type.STRING, description: '"below", "above", "right", "left"' },
      x: { type: Type.NUMBER, description: 'X position' },
      y: { type: Type.NUMBER, description: 'Y position' },
      fontSize: { type: Type.NUMBER, description: 'Font size (default 20)' },
      strokeColor: { type: Type.STRING, description: 'Ink color' },
      fillColor: { type: Type.STRING, description: 'Bubble background color, e.g. rgba(200, 241, 58, 0.2)' }
    },
    required: ['text']
  }
};

const generateSketchIllustrationTool: FunctionDeclaration = {
  name: 'generate_sketch_illustration',
  description: 'Generate and place an iconic, on-brand architectural sketch illustration on the whiteboard (in Teolima\'s bespoke minimalist ink, parchment paper, and neon-volt accent drawing style). Use this to illustrate multi-agent metaphors (e.g., Executive Chef kitchen, Air Traffic Control tower, Bank Vault guardrail, Vector filing archive, Human review desk) or domain-specific workflows.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: {
        type: Type.STRING,
        description: 'Detailed description of the visual scene/icon to sketch (e.g. "A robotic head chef orchestrating assistant worker chefs with order tickets", "A secure bank vault with a biometric human approval key", "A fast web crawler indexing documents into filing drawers")'
      },
      caption: {
        type: Type.STRING,
        description: 'Short handwritten caption displayed below the sketch (e.g. "Orchestrator Kitchen Metaphor", "Human Approval Gate", "Vector Filing Archive")'
      },
      attachToNode: {
        type: Type.STRING,
        description: 'Optional agent node or component to place this sketch illustration next to'
      },
      relativePosition: {
        type: Type.STRING,
        description: '"below", "above", "right", "left", "auto"'
      },
      x: { type: Type.NUMBER, description: 'X position on whiteboard (default 500)' },
      y: { type: Type.NUMBER, description: 'Y position on whiteboard (default 240)' },
      width: { type: Type.NUMBER, description: 'Width in pixels (default 270)' },
      height: { type: Type.NUMBER, description: 'Height in pixels (default 230)' },
      aspectRatio: { type: Type.STRING, description: '"1:1", "4:3", "16:9" (default "4:3")' }
    },
    required: ['prompt']
  }
};


// Helper to initialize Gemini SDK
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = config.geminiApiKey;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY environment variable is not set.');
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * On-brand strict procedural sketch generator fallback
 * Guarantees a clean, stylish hand-drawn vector artwork matching Teolima's ink + volt aesthetic
 */
function generateProceduralBrandSketchSvg(prompt: string, caption?: string): string {
  const cleanPrompt = (prompt || 'Multi-Agent System Workflow').replace(/"/g, "'").slice(0, 55);
  const cleanCap = (caption || 'Architectural Sketch').replace(/"/g, "'").slice(0, 36);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450" width="600" height="450">
    <rect width="600" height="450" fill="#fafafa"/>
    <defs>
      <pattern id="grid-sketch" width="28" height="28" patternUnits="userSpaceOnUse">
        <circle cx="14" cy="14" r="0.75" fill="rgba(24,24,28,0.12)"/>
      </pattern>
    </defs>
    <rect width="600" height="450" fill="url(#grid-sketch)"/>
    
    <!-- Volt soft watercolor accent wash -->
    <path d="M110,170 Q280,100 480,190 Q390,340 160,300 Z" fill="rgba(200,241,58,0.22)" stroke="none"/>
    <path d="M220,130 Q380,80 440,240 Q300,320 200,260 Z" fill="rgba(200,241,58,0.15)" stroke="none"/>
    
    <!-- Architectural Hand-Drawn Contour Geometry -->
    <g fill="none" stroke="#18181c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <!-- Main bounding card frame -->
      <rect x="140" y="110" width="320" height="210" rx="14" stroke-dasharray="3 2" opacity="0.6"/>
      <rect x="135" y="105" width="330" height="220" rx="16"/>
      
      <!-- Core Node & Agents -->
      <circle cx="210" cy="190" r="28" fill="#ffffff"/>
      <circle cx="390" cy="190" r="28" fill="#ffffff"/>
      <rect x="270" y="160" width="60" height="60" rx="8" fill="#ffffff"/>
      
      <!-- Internal sketch hatching -->
      <path d="M195,190 L225,190 M210,175 L210,205"/>
      <path d="M375,190 L405,190 M390,175 L390,205"/>
      <path d="M285,175 L315,205 M285,205 L315,175"/>
      
      <!-- Directed Signal arrows -->
      <path d="M240,190 L266,190 M258,184 L268,190 L258,196" stroke-width="2.2"/>
      <path d="M333,190 L360,190 M352,184 L362,190 L352,196" stroke-width="2.2"/>
      
      <!-- Secondary Worker nodes below -->
      <circle cx="300" cy="275" r="22" fill="#ffffff"/>
      <path d="M300,222 L300,250 M294,242 L300,252 L306,242" stroke-width="2.2"/>
      
      <!-- Technical antenna & bus lines -->
      <path d="M90,215 L132,215 M120,208 L134,215 L120,222" stroke-width="2"/>
      <path d="M468,215 L510,215 M496,208 L510,215 L496,222" stroke-width="2"/>
    </g>
    
    <!-- Top masking tape badge in Volt (#c8f13a) -->
    <rect x="245" y="74" width="110" height="24" rx="4" fill="#c8f13a" stroke="#18181c" stroke-width="1.6"/>
    <text x="300" y="90" font-family="'IBM Plex Mono', monospace" font-size="11" font-weight="700" fill="#18181c" text-anchor="middle">⚡ ON-BRAND</text>
    
    <!-- Caption & Metaphor Tag -->
    <text x="300" y="358" font-family="'Nanum Pen Script', cursive, sans-serif" font-size="26" fill="#18181c" text-anchor="middle">${cleanCap}</text>
    <text x="300" y="388" font-family="'IBM Plex Mono', monospace" font-size="11" fill="#5a5a62" text-anchor="middle">${cleanPrompt}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Generates an iconic on-brand hand-drawn sketch illustration using Gemini Flash Image models, Gemini 3.7 Flash SVG synthesis, or procedural vector art
 */
async function generateBrandSketchImage(prompt: string, caption?: string, aspectRatio = '4:3'): Promise<string> {
  const cleanPrompt = (prompt || 'Multi-Agent System Workflow').replace(/"/g, "'").slice(0, 70);
  const cleanCap = (caption || 'Architectural Sketch').replace(/"/g, "'").slice(0, 36);

  const ai = getGeminiClient();
  if (ai) {
    // 1. Try Gemini 3.1 Flash Image (Nano Banana 2) or Lite Image for true on-brand sketch generation
    try {
      console.log('[ImageGen] Generating brand sketch image for prompt:', prompt);
      const BRAND_SKETCH_PROMPT = `Minimalist architectural hand-drawn line art sketch illustration on clean off-white parchment paper, crisp black ink contour lines with subtle rough sketch hatching, delicate lime-volt green (#c8f13a) and charcoal (#18181c) watercolor accents, clean vector-like precision, iconic technical diagram whiteboard illustration of: ${cleanPrompt}`;

      const ratio = aspectRatio === '1:1' ? '1:1' : aspectRatio === '16:9' ? '16:9' : '4:3';
      let imgResp: any = null;
      try {
        imgResp = await ai.models.generateContent({
          model: config.models.imageLite,
          contents: {
            parts: [
              {
                text: BRAND_SKETCH_PROMPT,
              },
            ],
          },
          config: {
            imageConfig: {
              aspectRatio: ratio as any,
            },
          },
        });
      } catch (liteErr) {
        // Retry with the full image model
        imgResp = await ai.models.generateContent({
          model: config.models.image,
          contents: {
            parts: [
              {
                text: BRAND_SKETCH_PROMPT,
              },
            ],
          },
          config: {
            imageConfig: {
              aspectRatio: ratio as any,
              imageSize: '1K',
            },
          },
        });
      }

      const parts = imgResp?.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          return `data:${mime};base64,${part.inlineData.data}`;
        }
      }
    } catch (imgErr: any) {
      console.warn('[ImageGen] Gemini image model generation error, trying SVG synthesis:', imgErr?.message || imgErr);
    }

    // 2. Synthesize custom bespoke architectural SVG drawing using Gemini 3.7 Flash
    try {
      console.log('[ImageGen] Synthesizing brand sketch SVG for prompt:', prompt);
      const systemInstruction = `You are a world-class architectural vector illustrator for Teolima.
Your task is to generate a single valid, self-contained SVG illustration (viewBox="0 0 600 450", width="600", height="450") depicting the requested concept/metaphor strictly in Teolima's iconic architectural sketch style.

BRAND DESIGN CONSTRAINTS:
- Canvas background: Clean off-white parchment (#fafafa) with subtle dot grid or clean space.
- Primary lines: Crisp dark charcoal/black ink (#18181c) with stroke-width 2 to 3, stroke-linecap="round", stroke-linejoin="round", hand-drawn feel.
- Accent color: Vibrant lime-volt green (rgba(200, 241, 58, 0.25) to #c8f13a) used for soft watercolor wash blobs (<path fill="rgba(200,241,58,0.22)" .../>) or badge tape.
- Drawing style: Minimalist technical sketch line art depicting the metaphor (e.g. chef hats/pots for orchestrators, bank vault doors/shields for safety guardrails, library filing cabinets for vector memory, radar antennas for routers, approval desks for human-in-the-loop).
- Include directed hand-drawn arrows, connection buses, or technical annotations.
- Include a small top badge in Volt (#c8f13a): <rect ... fill="#c8f13a" .../><text fill="#18181c" font-family="'IBM Plex Mono', monospace" font-size="10" font-weight="700">⚡ AI SKETCH</text>
- At the bottom center, render the caption "${cleanCap}" in font-family="'Nanum Pen Script', cursive, sans-serif" font-size="24" fill="#18181c".
- Output ONLY valid raw <svg ...>...</svg> without any markdown fences, without backticks, and without any explanatory text.`;

      const response = await ai.models.generateContent({
        model: config.models.text,
        contents: [
          {
            role: 'user',
            parts: [{ text: `Generate an architectural brand sketch SVG for this concept/metaphor: "${cleanPrompt}". Caption: "${cleanCap}".` }]
          }
        ],
        config: {
          systemInstruction,
          temperature: 0.4,
        }
      });

      let svgText = response.text || '';
      // Strip markdown code fences if present
      svgText = svgText.replace(/```xml/gi, '').replace(/```svg/gi, '').replace(/```/g, '').trim();

      if (svgText.includes('<svg') && svgText.includes('</svg>')) {
        const svgStart = svgText.indexOf('<svg');
        const svgEnd = svgText.lastIndexOf('</svg>') + 6;
        const validSvg = svgText.substring(svgStart, svgEnd);
        return `data:image/svg+xml;utf8,${encodeURIComponent(validSvg)}`;
      }
    } catch (svgErr: any) {
      console.warn('[ImageGen] Gemini 3.7 Flash SVG synthesis error, using high-res procedural fallback:', svgErr?.message || svgErr);
    }
  }

  return generateProceduralBrandSketchSvg(prompt, caption);
}

// WebSocket Connection Handler for Real-Time Duplex Audio & Tool Streaming
wss.on('connection', async (clientWs: WebSocket) => {
  console.log('[WebSocket] Client connected to live speech canvas');
  clientWs.send(JSON.stringify({ type: 'connected', message: 'Connected to live canvas server' }));

  const ai = getGeminiClient();
  let liveSession: any = null;
  let isSessionActive = false;
  let stopDemo: (() => void) | null = null;

  // Hard caps: a session can never outlive SESSION_MAX_MINUTES or sit idle past IDLE_TIMEOUT_SECONDS.
  const closeWith = (reason: string) => {
    clientWs.send(JSON.stringify({ type: 'status', status: { connected: false, state: 'idle', message: reason } }));
    clientWs.close(1000, reason);
  };
  const sessionTimer = setTimeout(() => closeWith('Session time limit reached'), config.sessionMaxMs);
  let idleTimer = setTimeout(() => closeWith('Session closed after inactivity'), config.idleTimeoutMs);
  const touch = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => closeWith('Session closed after inactivity'), config.idleTimeoutMs);
  };

  const session = new BoardSession();
  const sendBoard = (summary?: string) => sendClient({ type: 'board', board: session.board, summary });
  let asyncTools = false;

  const sendClient = (m: unknown) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify(m));
  };

  const respond = (call: { id?: string; name?: string }, output: Record<string, unknown>) => {
    if (!liveSession || !isSessionActive) return;
    try {
      liveSession.sendToolResponse({ functionResponses: [toolResponse(call, output, asyncTools)] });
    } catch (err) {
      console.error('[LiveAPI] Failed to send tool response:', err);
    }
  };

  async function runWebSearch(rawCall: any) {
    const query = String(rawCall.args?.query || '').slice(0, 300);
    if (!query || !ai) return respond(rawCall, { error: 'Web search unavailable or empty query.' });
    sendClient({ type: 'status', status: { connected: true, state: 'searching', message: `Searching the web for "${query}"...` } });
    try {
      const searchResp = await ai.models.generateContent({
        model: config.models.text,
        contents: `You are a search grounding assistant for a multi-agent systems architect. Search and summarize the most up-to-date documentation, schemas, API specifications, and design patterns for:\n${query}\n\nProvide key architectural components, best practices, and recommended flow.`,
        config: { tools: [{ googleSearch: {} }] },
      });
      respond(rawCall, wrapUntrustedSearch(query, searchResp.text || 'No additional technical details found.'));
    } catch (err) {
      console.error('[LiveAPI] Web search error:', err);
      respond(rawCall, { error: 'Web search temporarily unavailable.' });
    }
  }

  async function handleToolCall(rawCall: any) {
    if (rawCall?.name === 'web_search') return runWebSearch(rawCall);

    if (BOARD_TOOLS.has(rawCall?.name)) {
      const args = (rawCall.args ?? {}) as Record<string, unknown>;
      const body = toChangeBody(rawCall.name, args);
      if (!body) return respond(rawCall, { ok: false, error: `Unknown tool ${rawCall.name}` });
      const result = session.apply(body, 'coach', String(args.reason ?? ''));
      if ('error' in result) {
        console.warn(`[Board] Refused ${rawCall.name}: ${result.error}`);
        return respond(rawCall, { ok: false, error: result.error, board: session.summary() });
      }
      console.log(`[Board] coach: ${result.summary} (${String(args.reason ?? 'no reason given')})`);
      sendBoard(result.summary);
      return respond(rawCall, { ok: true, summary: result.summary, warnings: result.warnings, board: session.summary() });
    }

    const checked = validateToolCall(rawCall);
    if (!checked.ok || !checked.call) {
      console.warn('[LiveAPI] Rejected tool call:', checked.error);
      return respond(rawCall ?? {}, { success: false, error: checked.error });
    }
    if (checked.dropped.length > 0) {
      console.warn('[LiveAPI] Dropped invalid arguments:', checked.dropped.join(', '));
    }
    const fc = checked.call;
    const args = (fc.args ?? {}) as Record<string, any>;

    if (fc.name === 'generate_sketch_illustration') {
      const prompt = args.prompt || 'System Architecture Metaphor';
      const caption = args.caption || args.label || 'Workflow Sketch';
      const imageUrl = await generateBrandSketchImage(prompt, caption, args.aspectRatio || '4:3');
      sendClient({
        type: 'tool_call',
        toolCalls: [{ ...fc, args: { ...args, imageUrl, imageCaption: caption, imagePrompt: prompt } }],
      });
      // The image itself stays out of the model's context; it only needs to know it was placed.
      return respond(fc, { success: true, placed: true, caption });
    }

    sendClient({ type: 'tool_call', toolCalls: [fc] });
    respond(fc, { success: true });
  }

  async function initLiveSession(voiceName = 'Kore') {
    if (!ai) {
      // No key: replay a recorded session through the same tool-call path.
      clientWs.send(JSON.stringify({
        type: 'status',
        status: { connected: true, state: 'demo', message: 'Demo mode: replaying a recorded session. Add GEMINI_API_KEY for live coaching.' }
      }));
      sendClient({ type: 'transcript', transcript: { speaker: 'user', text: DEMO_GOAL } });
      stopDemo?.();
      session.apply({ op: 'clear' }, 'coach', 'Start the demo on an empty board');
      sendBoard();
      stopDemo = playDemo((step) => {
        if ('say' in step) {
          sendClient({ type: 'transcript', transcript: { speaker: 'ai', text: step.say } });
          return;
        }
        const result = session.apply(step.change, 'coach', step.reason);
        if ('error' in result) console.error('[Demo] Refused change:', result.error);
        else sendBoard(result.summary);
      });
      return;
    }

    // A session counts as connected only once the Live API confirms setup
    // (setupComplete). A bad key or an unavailable model closes the socket after
    // it opens, so resolving on open alone would hide the failure and skip the fallback.
    const connect = (model: string) => new Promise<any>((resolve, reject) => {
      asyncTools = supportsAsyncTools(model);
      let session: any = null;
      let setupDone = false;
      let settled = false;
      let connected = false;
      const timer = setTimeout(() => fail('timed out waiting for the session to start'), 10_000);
      const fail = (why: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { session?.close(); } catch {}
        reject(new Error(why));
      };
      const maybeResolve = () => {
        if (settled || !session || !setupDone) return;
        settled = true;
        connected = true;
        clearTimeout(timer);
        resolve(session);
      };
      ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          systemInstruction: COACH_PROMPT,
          tools: [
            {
              functionDeclarations: declareTools([
                ...boardToolDeclarations,
                webSearchTool,
                drawCalloutTool,
                highlightAreaTool,
                generateSketchIllustrationTool,
              ], asyncTools)
            }
          ]
        },
        callbacks: {
          onmessage: async (message: LiveServerMessage) => {
            if (!settled && message.setupComplete) {
              setupDone = true;
              maybeResolve();
            }
            try {
              // 1. Audio stream chunks (24kHz PCM)
              const parts = message.serverContent?.modelTurn?.parts;
              if (parts && parts.length > 0) {
                for (const part of parts) {
                  if (part.inlineData && part.inlineData.data) {
                    clientWs.send(JSON.stringify({
                      type: 'audio',
                      audio: part.inlineData.data
                    }));
                  }
                  if (part.text) {
                    clientWs.send(JSON.stringify({
                      type: 'transcript',
                      transcript: { speaker: 'ai', text: part.text }
                    }));
                  }
                }
              }

              // 2. Interruption detection
              if (message.serverContent?.interrupted) {
                console.log('[LiveAPI] Interrupted by user');
                clientWs.send(JSON.stringify({ type: 'interrupted' }));
              }

              // 3. Tool calls: each one is answered on its own as soon as it is handled,
              // so a slow search or sketch never holds up the drawing calls around it.
              for (const rawCall of message.toolCall?.functionCalls ?? []) {
                void handleToolCall(rawCall);
              }
            } catch (err) {
              console.error('[LiveAPI] Error processing message:', err);
            }
          },
          onerror: (err: any) => {
            if (!settled) return fail(String(err?.message || err?.error?.message || 'connection error'));
            if (!connected) return;
            console.error('[LiveAPI] Error event:', err);
            clientWs.send(JSON.stringify({ type: 'error', error: String(err) }));
          },
          onclose: (event: any) => {
            const reason = event?.reason ? String(event.reason).slice(0, 200) : '';
            if (!settled) return fail(reason || 'closed before the session started');
            if (!connected) return;
            console.log('[LiveAPI] Session closed', reason);
            isSessionActive = false;
            sendClient({ type: 'status', status: { connected: false, state: 'idle', message: reason ? `Live session closed: ${reason}` : 'Live session closed' } });
          }
        }
      }).then((s) => {
        session = s;
        maybeResolve();
      }).catch((err) => fail(err?.message || String(err)));
    });

    const models = [...new Set([config.models.live, config.models.liveFallback])];
    for (const model of models) {
      try {
        console.log(`[LiveAPI] Connecting: model=${model} voice=${voiceName} asyncTools=${supportsAsyncTools(model)} prompt=${COACH_PROMPT_VERSION}`);
        liveSession = await connect(model);
        isSessionActive = true;
        sendBoard();
        sendClient({ type: 'status', status: { connected: true, state: 'listening', message: `Live session active (${model}, voice ${voiceName})` } });
        return;
      } catch (err: any) {
        console.error(`[LiveAPI] Connection failed for ${model}:`, err?.message || err);
      }
    }
    sendClient({ type: 'status', status: { connected: false, state: 'error', message: 'Could not connect to the Live API. Check GEMINI_API_KEY and GEMINI_LIVE_MODEL.' } });
  }

  clientWs.on('message', async (data: any) => {
    touch();
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'start_call') {
        if (msg.board && session.restore(msg.board)) {
          console.log(`[Board] Restored the board from the browser (${session.board.components.length} components)`);
        }
        await initLiveSession(typeof msg.voice === 'string' && /^[A-Za-z]{2,20}$/.test(msg.voice) ? msg.voice : 'Kore');
      } else if (msg.type === 'stop_call') {
        stopDemo?.();
        stopDemo = null;
        if (liveSession && isSessionActive) {
          try {
            liveSession.close();
          } catch {}
          liveSession = null;
          isSessionActive = false;
        }
        clientWs.send(JSON.stringify({
          type: 'status',
          status: { connected: false, state: 'idle', message: 'Call ended' }
        }));
      } else if (msg.type === 'board_change') {
        // A change the user made in the app, e.g. clearing the board. Validated like any other.
        const parsed = ChangeBody.safeParse(msg.body);
        if (!parsed.success) return;
        const result = session.apply(parsed.data, 'user', String(msg.reason ?? 'Changed in the app').slice(0, 300));
        if ('error' in result) return console.warn(`[Board] Refused user change: ${result.error}`);
        console.log(`[Board] user: ${result.summary}`);
        sendBoard(result.summary);
      } else if (msg.type === 'audio') {
        // Stream user microphone PCM16 16kHz
        if (liveSession && isSessionActive && msg.audio) {
          liveSession.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' }
          });
        }
      } else if (msg.type === 'text' && !ai) {
        clientWs.send(JSON.stringify({
          type: 'transcript',
          transcript: { speaker: 'ai', text: 'Demo mode replays one recorded session. Add a GEMINI_API_KEY to talk through your own system live.' }
        }));
      } else if (msg.type === 'text') {
        // Text prompt / question
        if (liveSession && isSessionActive && msg.text) {
          liveSession.sendRealtimeInput({
            text: msg.text
          });
        }
      } else if (msg.type === 'set_goal_context') {
        // Goal context set by user (goal text + coach archetype + technical level + file context)
        if (liveSession && isSessionActive) {
          const goal = String(msg.goal || msg.goalContext?.goal || '').slice(0, 2000);
          const coachArchetype = msg.coachArchetype || msg.goalContext?.coachArchetype || 'Practical Systems Builder';
          const coachDesc = msg.coachArchetypeDescription || msg.goalContext?.coachArchetypeDescription || '';
          const techLevel = msg.technicalLevel ?? msg.goalContext?.technicalLevel ?? 2;
          const techLabel = msg.technicalLevelLabel || msg.goalContext?.technicalLevelLabel || 'Level 2: Systems & Product Thinker';
          const fileName = msg.fileName || msg.goalContext?.fileName ? String(msg.fileName || msg.goalContext?.fileName).slice(0, 120) : undefined;
          const fileSnippet = String(msg.fileSnippet || msg.goalContext?.fileContent || '').slice(0, 8000);

          const depthRules: Record<number, string> = {
            1: 'A beginner. No unexplained acronyms; use everyday metaphors and say why each element is needed.',
            2: 'Understands LLMs, prompts and APIs. Focus on how work is split between agents, tools and approvals without over-explaining basics.',
            3: 'A hands-on AI engineer. Use precise terms: orchestration patterns, MCP tools, grounding, evaluation, retries.',
            4: 'A staff-level architect. Go deep on routing determinism, failure handling, latency, cost and evaluation.',
          };
          const level = Math.min(4, Math.max(1, Number(techLevel) || 2));
          const contextPrompt = goalContextPrompt({
            goal,
            coach: String(coachArchetype).slice(0, 80),
            coachDescription: String(coachDesc).slice(0, 200),
            level,
            levelLabel: String(techLabel).slice(0, 80),
            depthRule: depthRules[level],
            fileName,
            fileSnippet,
          });

          liveSession.sendRealtimeInput({
            text: contextPrompt
          });
        }
      } else if (msg.type === 'canvas_snapshot') {
        // Canvas visual snapshot for vision grounding
        if (liveSession && isSessionActive && msg.image) {
          liveSession.sendRealtimeInput({
            video: { data: msg.image, mimeType: 'image/jpeg' }
          });
        }
      }
    } catch (e) {
      console.error('[WebSocket] Failed to handle client message:', e);
    }
  });

  clientWs.on('close', () => {
    console.log('[WebSocket] Client disconnected');
    clearTimeout(sessionTimer);
    clearTimeout(idleTimer);
    stopDemo?.();
    if (liveSession && isSessionActive) {
      try {
        liveSession.close();
      } catch {}
      liveSession = null;
    }
  });
});

// REST Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!config.geminiApiKey,
    timestamp: Date.now()
  });
});

app.post('/api/generate-sketch', guardSketchEndpoint, async (req, res) => {
  try {
    const { prompt, caption, aspectRatio = '4:3' } = req.body || {};
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const imageUrl = await generateBrandSketchImage(prompt, caption, aspectRatio);
    res.json({
      success: true,
      imageUrl,
      caption: caption || prompt,
      prompt,
      aspectRatio,
    });
  } catch (err: any) {
    console.error('Error in /api/generate-sketch:', err);
    res.status(500).json({ error: err.message || 'Failed to generate sketch illustration' });
  }
});

// Start server with Vite middleware integration
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Teolima running on http://localhost:${PORT}`);
  });
}

startServer();
