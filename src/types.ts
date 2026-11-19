/**
 * Types and interfaces for the Teolima app: canvas elements, call state and messages.
 */

export type ToolType = 
  | 'draw_shape' 
  | 'draw_stroke' 
  | 'draw_text' 
  | 'draw_diagram' 
  | 'draw_math_or_chart' 
  | 'draw_agent_node'
  | 'draw_connection'
  | 'draw_doodle_writing'
  | 'draw_callout'
  | 'generate_sketch_illustration'
  | 'clear_canvas' 
  | 'highlight_area'
  | 'undo_last_drawing';

export type ShapeKind = 
  | 'rectangle' 
  | 'circle' 
  | 'ellipse' 
  | 'line' 
  | 'arrow' 
  | 'polygon' 
  | 'star' 
  | 'cylinder' 
  | 'cloud'
  | 'diamond'
  | 'sticky'
  | 'badge'
  | 'container'
  | 'connector'
  | 'boundary'
  | 'band'
  | 'legend';

export type AgentRoleKind = 
  | 'intake'
  | 'router'
  | 'agent'
  | 'tool'
  | 'memory'
  | 'guardrail'
  | 'human_approval'
  // board model roles
  | 'trigger'
  | 'knowledge'
  | 'approval'
  | 'output'
  | 'manager'
  // context diagram roles
  | 'actor'
  | 'system'
  | 'external'
  // deployment view roles
  | 'resource'
  | 'resource_reused';

export type FillStyle = 'hachure' | 'solid' | 'zigzag' | 'cross-hatch' | 'dots' | 'dashed' | 'none';

export interface Point {
  x: number;
  y: number;
}

export interface CanvasLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0 to 1
  order: number;
}

export interface CanvasElement {
  id: string;
  type: 'shape' | 'stroke' | 'text' | 'group' | 'doodle' | 'image';
  shapeKind?: ShapeKind;
  agentRole?: AgentRoleKind;
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: Point[];
  text?: string;
  subtext?: string;
  fontSize?: number;
  strokeColor: string;
  fillColor?: string;
  fillStyle?: FillStyle;
  strokeWidth: number;
  roughness: number;
  label?: string;
  author: 'ai' | 'user';
  timestamp: number;
  layerId?: string;
  // Doodle specific tags (e.g. underline, circled, spark)
  doodleStyle?: 'handwritten' | 'annotated' | 'spark' | 'callout' | 'arrow_curved';
  // Image specific attributes
  imageUrl?: string;
  imageCaption?: string;
  imagePrompt?: string;
  aspectRatio?: '1:1' | '4:3' | '16:9';
  // Board model connectors and containers
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  /** For a legend: the styles it names, in order. */
  legendItems?: Array<{ key: 'flow' | 'uses' | 'approval' | 'team' | 'boundary' | 'guardrail'; text: string }>;
  arrowHead?: boolean;
  // Animation state for progressive tweening
  animationProgress?: number; // 0 to 1
  isAnimating?: boolean;
  isQueued?: boolean;
}

export interface DrawingInstruction {
  tool: ToolType;
  params: {
    shape?: ShapeKind;
    agentRole?: AgentRoleKind;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    points?: Point[];
    text?: string;
    subtext?: string;
    label?: string;
    strokeColor?: string;
    fillColor?: string;
    fillStyle?: FillStyle;
    strokeWidth?: number;
    roughness?: number;
    fontSize?: number;
    doodleStyle?: 'handwritten' | 'annotated' | 'spark' | 'callout' | 'arrow_curved';
    // Precise Semantic Connection & Anchoring
    fromNode?: string;
    toNode?: string;
    fromAnchor?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
    toAnchor?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
    style?: 'solid' | 'dashed' | 'curved';
    // Relative Placement & Collision Avoidance
    attachToNode?: string;
    targetNode?: string;
    relativePosition?: 'below' | 'above' | 'right' | 'left' | 'auto';
    gridColumn?: number; // 1 (Intake), 2 (Router), 3 (Workers/Tools), 4 (Guardrails/Memory/Human)
    gridRow?: number; // 1, 2, 3, 4
    // Brand sketch image generation parameters
    prompt?: string;
    imageUrl?: string;
    imageCaption?: string;
    aspectRatio?: '1:1' | '4:3' | '16:9';
    // For diagrams
    diagramType?: 'flowchart' | 'mindmap' | 'architecture' | 'venn' | 'sequence';
    nodes?: Array<{ 
      id: string; 
      label: string; 
      sublabel?: string;
      x: number; 
      y: number; 
      shape?: ShapeKind; 
      role?: AgentRoleKind;
      color?: string;
      fill?: string;
    }>;
    connections?: Array<{ 
      from: string; 
      to: string; 
      label?: string;
      style?: 'solid' | 'dashed' | 'curved';
    }>;
    // For math/chart
    chartType?: 'bar' | 'coordinates' | 'function_curve' | 'pie';
    data?: Array<{ label: string; value: number }>;
  };
}

export interface LiveTranscriptItem {
  id: string;
  speaker: 'user' | 'ai' | 'system';
  text: string;
  timestamp: number;
  isFinal?: boolean;
}

export interface CallSession {
  id: string;
  title: string;
  goal?: string;
  domain?: string;
  coachArchetype?: string;
  technicalLevel?: number;
  technicalLevelLabel?: string;
  startedAt: number;
  endedAt?: number;
  durationSeconds: number;
  transcripts: LiveTranscriptItem[];
  drawingCount: number;
  elements: CanvasElement[];
  thumbnailUrl?: string;
}

/** How the coach explains: 1 new to AI ... 4 architect (server/prompts/coach.ts). */
export type CoachLevel = 1 | 2 | 3 | 4;

export interface VoiceSettings {
  voiceName: 'Zephyr' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir';
  level: CoachLevel;
  systemInstruction?: string;
  animationSpeed: 'slow' | 'normal' | 'fast';
  handDrawnRoughness: number;
  defaultStrokeWidth: number;
  soundEffects: boolean;
  canvasTheme: 'paper' | 'paper-dots' | 'paper-grid' | 'blueprint' | 'darkboard';
  aiLayerId?: string;
}

export interface WSClientMessage {
  type: 'audio' | 'text' | 'start_call' | 'stop_call' | 'set_brief' | 'board_change' | 'ping';
  audio?: string; // base64 16kHz PCM
  text?: string;
  voice?: string;
  goal?: string;
  domain?: string;
  coachArchetype?: string;
  coachArchetypeDescription?: string;
  technicalLevel?: number;
  technicalLevelLabel?: string;
  fileSnippet?: string;
  goalContext?: {
    goal: string;
    domain?: string;
    coachArchetype?: string;
    coachArchetypeDescription?: string;
    technicalLevel?: number;
    technicalLevelLabel?: string;
    fileContent?: string;
    fileName?: string;
  };
}

export interface WSServerMessage {
  type: 'connected' | 'audio' | 'tool_call' | 'interrupted' | 'transcript' | 'status' | 'error' | 'board' | 'documents';
  /** Documents the user pasted in this session, as the server accepted them. */
  documents?: Array<{ id: string; title: string; words: number }>;
  audio?: string; // base64 24kHz PCM
  /** The board model, sent after every accepted change. */
  board?: import('../shared/board/schema').Board;
  summary?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, any>;
  }>;
  transcript?: {
    speaker: 'user' | 'ai';
    text: string;
  };
  status?: {
    connected: boolean;
    state: 'idle' | 'listening' | 'speaking' | 'drawing' | 'searching' | 'error';
    message?: string;
  };
  error?: string;
}

