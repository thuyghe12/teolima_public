/**
 * Turns a board layout into canvas elements.
 *
 * Every element gets a stable id derived from the board (`board:node:<id>`,
 * `board:team:<id>`, `board:edge:<id>`, `board:title`), so the canvas can tell
 * a new element (drawn with animation) from a moved or relabelled one
 * (updated in place). Pure, so it can be tested without a browser.
 */
import type { Layout } from '../../../shared/board/layout';
import type { AgentRoleKind, CanvasElement } from '../../types';

export const BOARD_PREFIX = 'board:';

const base = { strokeColor: '#18181c', strokeWidth: 2, roughness: 1.1, author: 'ai' as const, timestamp: 0 };

export function boardElements(layout: Layout): CanvasElement[] {
  const out: CanvasElement[] = [];

  if (layout.boundary) {
    const b = layout.boundary;
    out.push({ ...base, id: `${BOARD_PREFIX}boundary`, type: 'shape', shapeKind: 'boundary', x: b.x, y: b.y, width: b.w, height: b.h, label: b.label, strokeColor: '#5a5a62' });
  }

  for (const band of layout.bands) {
    out.push({
      ...base,
      id: `${BOARD_PREFIX}band:${band.id}`,
      type: 'shape',
      shapeKind: 'band',
      agentRole: 'guardrail',
      x: band.x,
      y: band.y,
      width: band.w,
      height: band.h,
      label: band.title,
      subtext: band.subtitle,
    });
  }

  for (const t of layout.teams) {
    out.push({
      ...base,
      id: `${BOARD_PREFIX}team:${t.id}`,
      type: 'shape',
      shapeKind: 'container',
      x: t.x,
      y: t.y,
      width: t.w,
      height: t.h,
      label: t.label,
      strokeColor: '#87868e',
    });
  }

  for (const e of layout.edges) {
    out.push({
      ...base,
      id: `${BOARD_PREFIX}edge:${e.id}`,
      type: 'shape',
      shapeKind: 'connector',
      x: e.points[0].x,
      y: e.points[0].y,
      points: e.points,
      label: e.label || undefined,
      lineStyle: e.style,
      arrowHead: e.kind !== 'uses',
      strokeColor: e.kind === 'uses' ? '#87868e' : '#18181c',
    });
  }

  for (const n of layout.nodes) {
    out.push({
      ...base,
      id: `${BOARD_PREFIX}node:${n.id}`,
      type: 'shape',
      shapeKind: 'rectangle',
      agentRole: n.role as AgentRoleKind,
      x: n.x,
      y: n.y,
      width: n.w,
      height: n.h,
      label: n.title,
      subtext: n.subtitle,
      fillStyle: 'solid',
    });
  }

  if (layout.legend) {
    const l = layout.legend;
    out.push({ ...base, id: `${BOARD_PREFIX}legend`, type: 'shape', shapeKind: 'legend', x: l.x, y: l.y, width: l.w, height: l.h, legendItems: l.items });
  }

  if (layout.title) {
    out.push({
      ...base,
      id: `${BOARD_PREFIX}title`,
      type: 'text',
      x: layout.title.x,
      y: layout.title.y,
      text: layout.title.text,
      fontSize: 30,
    });
  }

  return out;
}

/** Draw order: the boundary at the back, then teams and bands, connectors, cards, then the title and legend. */
export function boardLayer(id: string): number {
  if (!id.startsWith(BOARD_PREFIX)) return 5;
  if (id === `${BOARD_PREFIX}boundary`) return 0;
  if (id.startsWith(`${BOARD_PREFIX}team:`) || id.startsWith(`${BOARD_PREFIX}band:`)) return 1;
  if (id.startsWith(`${BOARD_PREFIX}edge:`)) return 2;
  if (id.startsWith(`${BOARD_PREFIX}node:`)) return 3;
  return 4;
}
