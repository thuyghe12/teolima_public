import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

import { config } from './server/config';
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

const drawConnectionTool: FunctionDeclaration = {
  name: 'draw_connection',
  description: 'Draw a precise connecting flow arrow between two architectural components (e.g. from "Query Classifier" to "Web Search API"). Automatically snaps arrow endpoints directly to the component border anchors with an informative label.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      fromNode: { type: Type.STRING, description: 'Source component title or role (e.g. "User Intake", "Query Classifier", "Router", "Injury Risk Model")' },
      toNode: { type: Type.STRING, description: 'Destination component title or role (e.g. "Web Search API", "Internal SQL DB", "Guardrail Validator", "Human Approval Gate")' },
      label: { type: Type.STRING, description: 'Technical data flow or decision condition along the arrow (e.g. "public queries", "SQL payload", "risk score > 0.85", "sanitized prompt", "approved action")' },
      strokeColor: { type: Type.STRING, description: 'Hex stroke color (e.g. #18181c, #4f46e5, #16a34a, #dc2626)' },
      style: { type: Type.STRING, description: 'solid, dashed, or curved' }
    },
    required: ['fromNode', 'toNode']
  }
};

const drawShapeTool: FunctionDeclaration = {
  name: 'draw_shape',
  description: 'Draw a geometric shape or connecting arrow on the canvas whiteboard.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      shape: {
        type: Type.STRING,
        description: 'Kind of shape: rectangle, circle, ellipse, line, arrow, diamond, cylinder, cloud',
      },
      x: { type: Type.NUMBER, description: 'X coordinate on canvas (canvas grid ~1200x800, origin 0,0)' },
      y: { type: Type.NUMBER, description: 'Y coordinate on canvas' },
      width: { type: Type.NUMBER, description: 'Width of the shape' },
      height: { type: Type.NUMBER, description: 'Height of the shape' },
      fromNode: { type: Type.STRING, description: 'Optional source node name when shape is arrow' },
      toNode: { type: Type.STRING, description: 'Optional destination node name when shape is arrow' },
      label: { type: Type.STRING, description: 'Short technical label on the shape or connecting arrow (e.g. "json payload", "query", "evaluates")' },
      strokeColor: { type: Type.STRING, description: 'Hex stroke color (e.g. #18181c, #dc2626, #16a34a, #d97706, #4f46e5)' },
      fillColor: { type: Type.STRING, description: 'Hex fill color or rgba (e.g. rgba(200, 241, 58, 0.15))' },
      fillStyle: { type: Type.STRING, description: 'solid, hachure, zigzag, dots, or none' },
      strokeWidth: { type: Type.NUMBER, description: 'Line thickness (default 2)' },
      roughness: { type: Type.NUMBER, description: 'Hand-drawn roughness level from 0.5 to 2.5' }
    },
    required: ['shape', 'x', 'y', 'width', 'height']
  }
};

const drawStrokeTool: FunctionDeclaration = {
  name: 'draw_stroke',
  description: 'Draw a freehand curve or custom connecting arrow path with a list of coordinates.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      points: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER }
          },
          required: ['x', 'y']
        },
        description: 'Array of points representing the freehand stroke'
      },
      strokeColor: { type: Type.STRING, description: 'Hex stroke color' },
      strokeWidth: { type: Type.NUMBER, description: 'Thickness in pixels' }
    },
    required: ['points']
  }
};

const drawTextTool: FunctionDeclaration = {
  name: 'draw_text',
  description: 'Write a clean system title or section header on the whiteboard canvas.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING, description: 'The title or section text (e.g. "Multi-Agent Risk Pipeline", "Memory & State Layer")' },
      x: { type: Type.NUMBER, description: 'X coordinate' },
      y: { type: Type.NUMBER, description: 'Y coordinate' },
      fontSize: { type: Type.NUMBER, description: 'Font size in pixels (default 20)' },
      strokeColor: { type: Type.STRING, description: 'Text color' },
      fillColor: { type: Type.STRING, description: 'Optional background badge color' }
    },
    required: ['text', 'x', 'y']
  }
};

const drawDiagramTool: FunctionDeclaration = {
  name: 'draw_diagram',
  description: 'Draw a complete structured multi-agent architecture diagram with nodes and connecting flow arrows.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      diagramType: { type: Type.STRING, description: 'architecture, flowchart, sequence, mindmap' },
      nodes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            label: { type: Type.STRING },
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER },
            shape: { type: Type.STRING },
            color: { type: Type.STRING }
          },
          required: ['id', 'label', 'x', 'y']
        }
      },
      connections: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            from: { type: Type.STRING },
            to: { type: Type.STRING },
            label: { type: Type.STRING }
          },
          required: ['from', 'to']
        }
      }
    },
    required: ['nodes', 'connections']
  }
};

const drawChartTool: FunctionDeclaration = {
  name: 'draw_math_or_chart',
  description: 'Draw a coordinate graph, bar chart, or metric illustration on the whiteboard.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      chartType: { type: Type.STRING, description: 'bar, coordinates, pie' },
      x: { type: Type.NUMBER, description: 'Top left origin' },
      y: { type: Type.NUMBER, description: 'Top left origin' },
      data: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING },
            value: { type: Type.NUMBER }
          },
          required: ['label', 'value']
        }
      }
    },
    required: ['chartType', 'data']
  }
};

const clearCanvasTool: FunctionDeclaration = {
  name: 'clear_canvas',
  description: 'Wipe or clear the whiteboard when starting a completely fresh architecture topic.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      reason: { type: Type.STRING, description: 'Brief reason for clearing' }
    }
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

const undoDrawingTool: FunctionDeclaration = {
  name: 'undo_last_drawing',
  description: 'Undo or step back the previous drawing action when correcting mistakes.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      reason: { type: Type.STRING, description: 'Optional reason for undoing' }
    }
  }
};

const drawDoodleWritingTool: FunctionDeclaration = {
  name: 'draw_doodle_writing',
  description: 'Write concise handwritten architectural notes, technical constraints, or component notes (e.g. "Max 3 Retries", "NeMo Guardrail", "P95 < 1.5s", "TTL: 24h", "Human Sign-off"). NEVER draw verbatim conversational speech or filler sentences.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      text: { 
        type: Type.STRING, 
        description: 'The concise technical note or constraint to write (e.g. "Checks budget ≤ $20", "Vector similarity > 0.82", "Fallback to Search if SQL fails"). MUST NOT be conversational filler or transcripts of your speech.' 
      },
      attachToNode: {
        type: Type.STRING,
        description: 'Optional component name to attach this constraint or note to (e.g. "Internal SQL DB", "Router", "Injury Risk Model")'
      },
      relativePosition: {
        type: Type.STRING,
        description: 'Position relative to the attached component: "below", "above", "right", "left"'
      },
      x: { type: Type.NUMBER, description: 'X position on canvas' },
      y: { type: Type.NUMBER, description: 'Y position on canvas' },
      fontSize: { type: Type.NUMBER, description: 'Font size in pixels (default 22)' },
      strokeColor: { type: Type.STRING, description: 'Text ink color, defaults to #18181c or #5a5a62' },
      doodleStyle: { 
        type: Type.STRING, 
        description: 'Style: "handwritten" (wavy underline), "spark" (volt dot spark), "annotated" (accent line), "callout" (boxed)' 
      }
    },
    required: ['text']
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

const drawAgentNodeTool: FunctionDeclaration = {
  name: 'draw_agent_node',
  description: 'Draw a specialized multi-agent architectural component card (Intake Trigger, Router, Worker Agent, Tool/MCP, Vector Memory, Guardrail, Human-in-the-Loop Review).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      label: { type: Type.STRING, description: 'Component title (e.g. "Player Data Intake", "Risk Analyzer Router", "Trend Analyst Agent", "Pinecone Vector DB", "Dosage Guardrail")' },
      subtext: { type: Type.STRING, description: 'Short subtitle or prompt instruction (e.g. "Extracts vitals & stats", "Evaluator loop with score > 0.85", "MCP Server / CRM API")' },
      agentRole: { 
        type: Type.STRING, 
        description: 'Role category: "intake", "router", "agent", "tool", "memory", "guardrail", "human_approval"' 
      },
      gridColumn: { type: Type.NUMBER, description: 'Architectural column tier: 1 (Intake), 2 (Router/Supervisor), 3 (Workers/Tools), 4 (Safeguards/Memory/Human Gate)' },
      gridRow: { type: Type.NUMBER, description: 'Row slot: 1, 2, 3, 4' },
      shape: { type: Type.STRING, description: 'rectangle, diamond, cylinder, circle' },
      x: { type: Type.NUMBER, description: 'X coordinate (typical range 100 to 1100)' },
      y: { type: Type.NUMBER, description: 'Y coordinate (typical range 100 to 700)' },
      width: { type: Type.NUMBER, description: 'Width in pixels (default 160)' },
      height: { type: Type.NUMBER, description: 'Height in pixels (default 85)' },
      strokeColor: { type: Type.STRING, description: 'Border stroke color' },
      fillColor: { type: Type.STRING, description: 'Card fill color' }
    },
    required: ['label']
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

const SYSTEM_INSTRUCTION = `
You are TEOLIMA, the world's foremost Multi-Agent Systems Solutions Architect and the ultimate coach for ambitious non-technical builders, founders, and domain experts.

Your Dual Identity & Mastery:
1. MASTER SOLUTIONS ARCHITECT:
   - Deep expertise in multi-agent orchestration paradigms:
     * Router / Dispatcher Topologies (Classifying intent, single vs parallel agent dispatch)
     * Orchestrator-Workers & Hierarchical Teams (Supervisor agents decomposing complex goals into sub-tasks)
     * Evaluator-Optimizer & Reflexion Loops (Generator agent proposes, Critic/Validator agent critiques with retry bounds)
     * Swarm / Peer-to-Peer / A2A (Dynamic handoffs between specialized peer agents)
     * Tool & MCP (Model Context Protocol) Integration (Separating deterministic APIs from LLM reasoning)
     * Memory Hierarchies (Short-term thread scratchpad vs long-term Vector DB embeddings vs SQL state)
     * Safety, Budgets & Guardrails (Input sanitization, output guardrails, token/cost limits, latency ceilings)
     * Human-in-the-Loop (HITL) Checkpoints (Mandatory approval gates for irreversible, financial, or sensitive actions)
   - You know state-of-the-art frameworks (LangGraph, CrewAI, AutoGen, Google ADK/Interactions, LlamaIndex Workflows, OpenAI Swarm, Semantic Kernel, NeMo Guardrails).

2. WORLD-CLASS COACH & MENTOR FOR NON-TECH BUILDERS:
   - Warm, encouraging, crystal-clear, energetic, and completely jargon-free by default.
   - You translate abstract distributed AI concepts into intuitive, unforgettable real-world metaphors (e.g. comparing an Orchestrator to an Executive Chef or Air-Traffic Controller, a Guardrail to a Quality Inspector, Vector Memory to a Searchable Filing Cabinet, Human Approval to an Executive Sign-off).
   - You empower the user to feel total confidence and ownership over their AI system design.

Proactive Web Search Grounding:
- If the user asks about specific newer frameworks, tools, APIs, domain-specific multi-agent specs (e.g., LangGraph StateGraph, CrewAI Flows, AutoGen Studio, MCP servers, specific health/finance APIs, vector database benchmarks), ALWAYS proactively call 'web_search' to get the latest facts and documentation before finalizing your recommendation.

CRITICAL RELATIVE POSITIONING & WHITEBOARD SPATIAL AWARENESS:
1. **ARCHITECTURAL TIERS & GRID PLACEMENT**:
   - Use 'draw_agent_node' with explicit grid placement:
     * Column 1 (gridColumn: 1 or x: 140): Intake Triggers & Input Sources (e.g., User Chat, Wearable Sensors, Webhook).
     * Column 2 (gridColumn: 2 or x: 440): Orchestrator Router / Supervisor / Query Classifier.
     * Column 3 (gridColumn: 3 or x: 780): Specialized Worker Sub-Agents, Tools & APIs (e.g., Web Search, SQL DB, Risk Analyst).
     * Column 4 (gridColumn: 4 or x: 1100): Guardrails, Evaluator Loops, Vector Memory & Human Approval Gates.
   - Rows: Use gridRow 1 (y: 160), gridRow 2 (y: 340), gridRow 3 (y: 520), gridRow 4 (y: 700).

2. **CONNECTING COMPONENTS ('draw_connection')**:
   - ALWAYS connect components by passing their exact labels in 'fromNode' and 'toNode' (e.g. fromNode: "Risk Router", toNode: "Internal SQL DB", label: "query stats").
   - This guarantees magnetic anchor calculation on the perimeter with non-overlapping routes!

3. **CONSTRAINTS, NOTES & CALLOUTS ('draw_doodle_writing', 'draw_callout')**:
   - ALWAYS attach technical constraints and notes to a component using 'attachToNode' (e.g. attachToNode: "Internal SQL DB", relativePosition: "below").
   - NEVER place raw notes floating directly on top of node boxes!

4. **ON-BRAND SKETCH ILLUSTRATIONS ('generate_sketch_illustration')**:
   - When explaining memorable real-world metaphors, workflows, or personas (e.g., "Executive Chef kitchen with line cooks", "Radar tower dispatcher", "Vector filing room", "Security guardrail vault"), call 'generate_sketch_illustration' with a descriptive prompt and caption.
   - Attach it to a relevant component using 'attachToNode' (e.g. attachToNode: "Executive Chef Router", relativePosition: "below") or place it in an open column tier without colliding with existing cards.

5. **TARGETED HIGHLIGHTS ('highlight_area')**:
   - When highlighting a component you are talking about, pass 'targetNode: "Component Name"' so the highlight loop automatically snaps to and encircles that exact card!

6. **STRICT PROHIBITION ON DRAWING CONVERSATIONAL FILLER**:
   ❌ NEVER EVER draw what you are casually saying or thinking out loud!
   ❌ NEVER draw transcripts of your speech (e.g., DO NOT DRAW: "Doodling the architecture for player safety!", "Let me sketch this for you", "Talking to coach", "Here is what I think", "Let's see what happens").
   ❌ Spoken voice is for conversational coaching. Visual drawings on canvas are EXCLUSIVELY for clean, production-ready system architecture components and iconic sketches.

Tone: Enthusiastic, brilliant, clear, concise, and deeply empowering.
`;

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

  async function initLiveSession(voiceName = 'Zephyr') {
    if (!ai) {
      clientWs.send(JSON.stringify({
        type: 'status',
        status: { connected: false, state: 'idle', message: 'Gemini API Key not set. Running in local simulation mode.' }
      }));
      return;
    }

    try {
      console.log('[LiveAPI] Connecting session with voice:', voiceName);
      liveSession = await ai.live.connect({
        model: config.models.live,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: (voiceName as any) || 'Zephyr' },
            },
          },
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [
            {
              functionDeclarations: [
                webSearchTool,
                drawConnectionTool,
                drawShapeTool,
                drawStrokeTool,
                drawTextTool,
                drawDoodleWritingTool,
                drawCalloutTool,
                drawAgentNodeTool,
                drawDiagramTool,
                drawChartTool,
                generateSketchIllustrationTool,
                clearCanvasTool,
                highlightAreaTool,
                undoDrawingTool
              ]
            }
          ]
        },
        callbacks: {
          onmessage: async (message: LiveServerMessage) => {
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

              // 3. Tool Calls (Emitted drawing, image generation or search instructions)
              const toolCall = message.toolCall;
              if (toolCall && toolCall.functionCalls && toolCall.functionCalls.length > 0) {
                console.log('[LiveAPI] Tool calls received:', toolCall.functionCalls.length);
                
                // Process each function call (image generation, web search, drawing)
                const functionResponses = await Promise.all(
                  toolCall.functionCalls.map(async (fc: any) => {
                    if (fc.name === 'web_search') {
                      const query = fc.args?.query || '';
                      console.log('[LiveAPI] Live Web Search requested for query:', query);
                      clientWs.send(JSON.stringify({
                        type: 'status',
                        status: {
                          connected: true,
                          state: 'searching',
                          message: `Searching live web for "${query}"...`
                        }
                      }));

                      try {
                        const searchAi = getGeminiClient();
                        if (searchAi && query) {
                          const searchResp = await searchAi.models.generateContent({
                            model: config.models.text,
                            contents: `You are an expert multi-agent systems solutions architect search grounding assistant. Search and summarize the most up-to-date documentation, schemas, API specifications, and design patterns for:\n${query}\n\nProvide key architectural components, best practices, and recommended flow.`,
                            config: {
                              tools: [{ googleSearch: {} }]
                            }
                          });
                          const searchSummary = searchResp.text || 'No additional technical details found.';
                          return {
                            response: { output: { query, results: searchSummary } },
                            id: fc.id,
                            name: fc.name
                          };
                        }
                      } catch (searchErr) {
                        console.error('[LiveAPI] Web search error:', searchErr);
                        return {
                          response: { output: { error: 'Web search temporarily unavailable.' } },
                          id: fc.id,
                          name: fc.name
                        };
                      }
                    }

                    if (fc.name === 'generate_sketch_illustration') {
                      const prompt = fc.args?.prompt || 'System Architecture Metaphor';
                      const caption = fc.args?.caption || fc.args?.label || 'Workflow Sketch';
                      const aspectRatio = fc.args?.aspectRatio || '4:3';
                      console.log('[LiveAPI] Generating sketch illustration:', prompt);

                      const imageUrl = await generateBrandSketchImage(prompt, caption, aspectRatio);

                      // Forward to client canvas with generated image payload
                      clientWs.send(JSON.stringify({
                        type: 'tool_call',
                        toolCalls: [
                          {
                            id: fc.id,
                            name: 'generate_sketch_illustration',
                            args: {
                              ...fc.args,
                              imageUrl,
                              imageCaption: caption,
                              imagePrompt: prompt,
                            }
                          }
                        ]
                      }));

                      return {
                        response: { output: { success: true, imageUrl, caption, rendered: true } },
                        id: fc.id,
                        name: fc.name
                      };
                    }

                    // Forward standard drawing tool calls to client for real-time canvas animation
                    clientWs.send(JSON.stringify({
                      type: 'tool_call',
                      toolCalls: [fc]
                    }));

                    // Default response for visual drawing tools
                    return {
                      response: { output: { success: true, rendered: true } },
                      id: fc.id,
                      name: fc.name
                    };
                  })
                );

                if (liveSession && isSessionActive) {
                  liveSession.sendToolResponse({ functionResponses });
                }
              }
            } catch (err) {
              console.error('[LiveAPI] Error processing message:', err);
            }
          },
          onerror: (err: any) => {
            console.error('[LiveAPI] Error event:', err);
            clientWs.send(JSON.stringify({ type: 'error', error: String(err) }));
          },
          onclose: () => {
            console.log('[LiveAPI] Session closed');
            isSessionActive = false;
          }
        }
      });

      isSessionActive = true;
      clientWs.send(JSON.stringify({
        type: 'status',
        status: { connected: true, state: 'listening', message: 'Gemini Live Session Active' }
      }));
    } catch (err: any) {
      console.error('[LiveAPI] Connection failed:', err);
      clientWs.send(JSON.stringify({
        type: 'status',
        status: { connected: false, state: 'error', message: err.message || 'Failed to connect Live API' }
      }));
    }
  }

  clientWs.on('message', async (data: any) => {
    touch();
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'start_call') {
        await initLiveSession(msg.voice || 'Zephyr');
      } else if (msg.type === 'stop_call') {
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
      } else if (msg.type === 'audio') {
        // Stream user microphone PCM16 16kHz
        if (liveSession && isSessionActive && msg.audio) {
          liveSession.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' }
          });
        }
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

          let techDepthRule = '';
          if (techLevel === 1) {
            techDepthRule = 'The user is a NOVICE / BEGINNER in multi-agent systems. DO NOT use unexplained AI/ML acronyms or dense academic jargon. Use intuitive real-world metaphors (e.g., head chef, air traffic controller, library archive). Explain clearly why each agent role is needed in plain English with warm encouragement.';
          } else if (techLevel === 2) {
            techDepthRule = 'The user is an INTERMEDIATE Systems & Product Thinker. They understand LLMs, prompts, and APIs. Focus on router-worker decomposition, state handoffs, external tools, and human approval gates without over-explaining basics.';
          } else if (techLevel === 3) {
            techDepthRule = 'The user is an ADVANCED Hands-On AI Engineer. They are familiar with LangGraph, CrewAI, MCP servers, embeddings, vector databases, and retry loops. Use standard industry terms directly (StateGraph, MCP tools, token budgets, retry policies, async routing).';
          } else {
            techDepthRule = 'The user is a STAFF AI ARCHITECT. Dive straight into high-depth distributed systems architecture: deterministic vs stochastic routing, streaming backpressure, distributed consensus/A2A handoffs, P99 latency ceilings, evaluator scoring functions, and failover fallbacks.';
          }

          const contextPrompt = `[SYSTEM CONTEXT & COACHING DIRECTIVE UPDATE]:
- USER'S SYSTEM GOAL: "${goal}"
- SELECTED COACH ARCHETYPE: "${coachArchetype}" (${coachDesc})
- USER TECHNICAL KNOWLEDGE LEVEL: ${techLabel} (Scale ${techLevel} of 4)
- DEPTH & VOCABULARY DIRECTIVE: ${techDepthRule}
${fileName ? `- UPLOADED CONTEXT DOCUMENT (${fileName}):\n${fileSnippet || ''}\n` : ''}

INSTRUCTION: Greet the user with high energy tailored to your selected Coach Archetype ("${coachArchetype}"). Acknowledge their project goal and technical background. Then immediately begin breaking down the multi-agent system architecture step-by-step, simultaneously sketching the architecture on the whiteboard using 'draw_agent_node', 'draw_connection', and 'draw_doodle_writing'.`;

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
      } else if (msg.type === 'canvas_state_update') {
        // Whiteboard spatial element synchronization
        if (liveSession && isSessionActive && Array.isArray(msg.elements) && msg.elements.length > 0) {
          const summaryList = msg.elements
            .map((el: any) => `• [${el.type.toUpperCase()}] "${el.label || el.role || el.id}" at (x: ${el.x}, y: ${el.y}, w: ${el.width}, h: ${el.height})`)
            .join('\n');
          liveSession.sendRealtimeInput({
            text: `[WHITEBOARD SPATIAL STATE SYNCHRONIZATION]:\nActive elements currently placed on canvas:\n${summaryList}\n\nMaintain spatial awareness: do NOT place new elements overlapping these exact bounding boxes. Connect to them using their exact names.`
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
