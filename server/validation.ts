/**
 * Server-side validation of the model's tool calls before they reach the browser.
 *
 * The model's arguments are untrusted input. Every call is checked against an
 * allowlist of tool names, and every argument is clamped or dropped:
 * coordinates stay on the canvas, colours must parse as colours, text has a
 * length cap and arrays have a size cap. A call that names an unknown tool is
 * rejected, and the model gets an error response instead of a silent success.
 */

/** The only drawing tools the coach has: notes and highlights that explain the board. */
export const ALLOWED_TOOLS = new Set(['draw_callout', 'highlight_area']);

const COORD = { min: -500, max: 4000 };
const SIZE = { min: 4, max: 1600 };
const MAX_TEXT = 400;
const MAX_LABEL = 160;
const MAX_POINTS = 600;
const MAX_NODES = 40;
const MAX_CONNECTIONS = 80;
const MAX_CHART_ITEMS = 24;

const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/;

const COORD_KEYS = new Set(['x', 'y', 'fromX', 'fromY', 'toX', 'toY']);
const SIZE_KEYS = new Set(['width', 'height', 'radius']);
const COLOR_KEYS = new Set(['strokeColor', 'fillColor', 'color', 'backgroundColor']);
const LONG_TEXT_KEYS = new Set(['text', 'prompt', 'reason']);

export type ToolCall = { id?: string; name: string; args?: Record<string, unknown> };
export type ValidationResult = {
  ok: boolean;
  /** Present when ok: the call with clean arguments. */
  call?: ToolCall;
  /** Argument paths that were removed because they failed validation. */
  dropped: string[];
  /** Present when not ok. */
  error?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizeValue(key: string, value: unknown, dropped: string[], path: string): unknown {
  const at = path ? `${path}.${key}` : key;

  if (value === null || value === undefined) return undefined;

  if (COORD_KEYS.has(key)) {
    const n = num(value);
    if (n === undefined) return dropped.push(at), undefined;
    return clamp(n, COORD.min, COORD.max);
  }
  if (SIZE_KEYS.has(key)) {
    const n = num(value);
    if (n === undefined) return dropped.push(at), undefined;
    return clamp(n, SIZE.min, SIZE.max);
  }
  if (key === 'fontSize') return num(value) !== undefined ? clamp(value as number, 8, 96) : (dropped.push(at), undefined);
  if (key === 'strokeWidth') return num(value) !== undefined ? clamp(value as number, 0.5, 12) : (dropped.push(at), undefined);
  if (key === 'roughness') return num(value) !== undefined ? clamp(value as number, 0, 3) : (dropped.push(at), undefined);
  if (key === 'gridColumn' || key === 'gridRow') {
    const n = num(value);
    return n !== undefined ? clamp(Math.round(n), 1, 4) : (dropped.push(at), undefined);
  }
  if (COLOR_KEYS.has(key)) {
    if (typeof value === 'string' && COLOR_RE.test(value.trim())) return value.trim();
    return dropped.push(at), undefined;
  }

  if (typeof value === 'string') {
    return value.slice(0, LONG_TEXT_KEYS.has(key) ? MAX_TEXT : MAX_LABEL);
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : (dropped.push(at), undefined);
  if (typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    const cap =
      key === 'points' ? MAX_POINTS :
      key === 'nodes' ? MAX_NODES :
      key === 'connections' ? MAX_CONNECTIONS :
      key === 'data' ? MAX_CHART_ITEMS : 20;
    if (value.length > cap) dropped.push(`${at}[${cap}..]`);
    return value
      .slice(0, cap)
      .map((item, i) =>
        item && typeof item === 'object'
          ? sanitizeObject(item as Record<string, unknown>, dropped, `${at}[${i}]`)
          : sanitizeValue(key, item, dropped, `${at}[${i}]`),
      )
      .filter((item) => item !== undefined);
  }

  if (typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>, dropped, at);
  }

  dropped.push(at);
  return undefined;
}

function sanitizeObject(obj: Record<string, unknown>, dropped: string[], path: string) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj).slice(0, 40)) {
    const clean = sanitizeValue(key, value, dropped, path);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}

/** Validates one tool call from the model. Never throws. */
export function validateToolCall(call: unknown): ValidationResult {
  if (!call || typeof call !== 'object') return { ok: false, error: 'Tool call is not an object', dropped: [] };
  const { id, name, args } = call as ToolCall;
  if (typeof name !== 'string' || !ALLOWED_TOOLS.has(name)) {
    return { ok: false, error: `Unknown tool: ${String(name).slice(0, 60)}`, dropped: [] };
  }
  const dropped: string[] = [];
  const cleanArgs = args && typeof args === 'object' ? sanitizeObject(args as Record<string, unknown>, dropped, '') : {};
  return { ok: true, call: { id, name, args: cleanArgs }, dropped };
}
