/**
 * How each visual family of building blocks is drawn (shared/catalog/blocks.ts).
 *
 *   agent       a card with a dark header band; its own capabilities docked
 *               as chips along the bottom
 *   capability  a rounded capsule tinted by kind (tool, knowledge, memory),
 *               with the Microsoft product named on top
 *   governance  an approval is a diamond: the standard shape for a decision
 *               gate, sitting on the path to what it gates
 *   io          a plain grey block for where work enters and leaves
 *
 * Every Microsoft product is named in full next to the element, as the Azure
 * icon guidance recommends; icons are added beside the names in a later change.
 */
import type { CanvasElement } from '../../types';

const INK = '#18181c';
const MUTED = '#5a5a62';
const FAINT = '#87868e';
const MONO = `'IBM Plex Mono', monospace`;
const SANS = `'Karla', sans-serif`;

type Ctx = CanvasRenderingContext2D;

/** Fits text on one line, ending with an ellipsis when it is cut. */
function clip(ctx: Ctx, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Up to `maxLines` lines that fit `max` pixels; the last is clipped. */
function lines(ctx: Ctx, text: string, max: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > max && line) {
      out.push(line);
      line = w;
      if (out.length === maxLines) break;
    } else line = next;
  }
  if (out.length < maxLines && line) out.push(line);
  if (out.length === maxLines && words.join(' ') !== out.join(' ')) out[maxLines - 1] = clip(ctx, `${out[maxLines - 1]}…`, max);
  return out;
}

function tag(ctx: Ctx, text: string, x: number, y: number, bg: string, fg: string, border?: string): number {
  ctx.font = `600 9px ${MONO}`;
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, 16, 3);
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 5, y + 8.5);
  return w;
}

const KIND_TINT: Record<string, { fill: string; line: string; text: string }> = {
  tool: { fill: '#f4f4f5', line: '#52525b', text: '#27272a' },
  knowledge: { fill: '#eef2ff', line: '#4f46e5', text: '#3730a3' },
  memory: { fill: '#f5f3ff', line: '#7c3aed', text: '#5b21b6' },
};

export function drawAgentCard(ctx: Ctx, el: CanvasElement, alpha: number) {
  const { x, y } = el;
  const w = el.width ?? 210;
  const h = el.height ?? 120;
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();

  // header band with the agent's name
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(x, y, w, 30, [10, 10, 0, 0]);
  ctx.fill();
  ctx.font = `600 14px ${SANS}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const role = el.agentRole === 'manager' ? 'MANAGER' : '';
  const roleW = role ? (ctx.font = `600 9px ${MONO}`, ctx.measureText(role).width + 16) : 0;
  ctx.font = `600 14px ${SANS}`;
  ctx.fillText(clip(ctx, el.label ?? '', w - 24 - roleW), x + 12, y + 15.5);
  if (role) tag(ctx, role, x + w - roleW - 4, y + 7, '#c8f13a', INK);

  // what it does, and the product it runs on
  ctx.font = `400 11px ${MONO}`;
  ctx.fillStyle = MUTED;
  const desc = lines(ctx, el.subtext ?? '', w - 24, 2);
  desc.forEach((l, i) => ctx.fillText(l, x + 12, y + 44 + i * 14));
  ctx.font = `500 9px ${MONO}`;
  ctx.fillStyle = FAINT;
  ctx.fillText((el.product ?? '').toUpperCase(), x + 12, y + 44 + Math.max(1, desc.length) * 14 + 2);

  // docked capabilities
  const chips = el.chips ?? [];
  let cx = x + 10;
  const cy = y + h - 26;
  const room = x + w - 10;
  for (let i = 0; i < chips.length; i++) {
    const c = chips[i];
    const tint = KIND_TINT[c.kind] ?? KIND_TINT.tool;
    ctx.font = `500 10px ${MONO}`;
    const left = chips.length - i - 1;
    const more = left > 0 ? `+${left}` : '';
    const moreW = more ? ctx.measureText(more).width + 14 : 0;
    const text = clip(ctx, c.title, Math.max(30, room - cx - 18 - moreW));
    const cw = ctx.measureText(text).width + 18;
    if (cx + cw > room - moreW && i > 0) {
      tag(ctx, `+${chips.length - i}`, cx, cy + 2, '#f4f4f5', MUTED);
      break;
    }
    ctx.fillStyle = tint.fill;
    ctx.strokeStyle = tint.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cx, cy, cw, 18, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = tint.line;
    ctx.beginPath();
    ctx.arc(cx + 7, cy + 9, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tint.text;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx + 13, cy + 9.5);
    cx += cw + 6;
  }
  ctx.restore();
}

export function drawCapsule(ctx: Ctx, el: CanvasElement, alpha: number) {
  const { x, y } = el;
  const w = el.width ?? 210;
  const h = el.height ?? 120;
  const kind = el.agentRole === 'knowledge' || el.agentRole === 'memory' ? el.agentRole : 'tool';
  const tint = KIND_TINT[kind];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = tint.fill;
  ctx.strokeStyle = tint.line;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 34);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 9px ${MONO}`;
  ctx.fillStyle = tint.text;
  ctx.fillText(clip(ctx, (el.blockName ?? '').toUpperCase(), w - 56), x + w / 2, y + 26);
  ctx.font = `600 14px ${SANS}`;
  ctx.fillStyle = INK;
  ctx.fillText(clip(ctx, el.label ?? '', w - 36), x + w / 2, y + 52);
  ctx.font = `400 11px ${MONO}`;
  ctx.fillStyle = MUTED;
  lines(ctx, el.subtext ?? '', w - 44, 2).forEach((l, i) => ctx.fillText(l, x + w / 2, y + 74 + i * 14));
  if (el.status === 'preview') tag(ctx, 'PREVIEW', x + w - 72, y + h - 26, '#fef3c7', '#92400e', '#f59e0b');
  ctx.restore();
}

export function drawGate(ctx: Ctx, el: CanvasElement, alpha: number) {
  const { x, y } = el;
  const w = el.width ?? 210;
  const h = el.height ?? 120;
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fffbeb';
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(x + w, cy);
  ctx.lineTo(cx, y + h);
  ctx.lineTo(x, cy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 9px ${MONO}`;
  ctx.fillStyle = '#92400e';
  ctx.fillText('APPROVAL', cx, cy - 24);
  ctx.font = `600 13px ${SANS}`;
  ctx.fillStyle = INK;
  ctx.fillText(clip(ctx, el.label ?? '', w * 0.55), cx, cy - 6);
  ctx.font = `400 10px ${MONO}`;
  ctx.fillStyle = MUTED;
  lines(ctx, el.subtext ?? '', w * 0.5, 2).forEach((l, i) => ctx.fillText(l, cx, cy + 12 + i * 12));
  ctx.restore();
}

export function drawBlock(ctx: Ctx, el: CanvasElement, alpha: number) {
  const { x, y } = el;
  const w = el.width ?? 210;
  const h = el.height ?? 120;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fafafa';
  ctx.strokeStyle = FAINT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.stroke();
  tag(ctx, el.agentRole === 'output' ? 'OUTPUT' : 'TRIGGER', x + 10, y + 10, '#ffffff', MUTED, '#d4d4d8');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `600 14px ${SANS}`;
  ctx.fillStyle = INK;
  ctx.fillText(clip(ctx, el.label ?? '', w - 24), x + 12, y + 50);
  ctx.font = `400 11px ${MONO}`;
  ctx.fillStyle = MUTED;
  lines(ctx, el.subtext ?? '', w - 24, 2).forEach((l, i) => ctx.fillText(l, x + 12, y + 72 + i * 14));
  ctx.restore();
}
