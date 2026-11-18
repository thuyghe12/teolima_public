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

/** Draw order: team containers at the back, then connectors, then cards, then the title. */
export function boardLayer(id: string): number {
  if (!id.startsWith(BOARD_PREFIX)) return 4;
  if (id.startsWith(`${BOARD_PREFIX}team:`)) return 0;
  if (id.startsWith(`${BOARD_PREFIX}edge:`)) return 1;
  if (id.startsWith(`${BOARD_PREFIX}node:`)) return 2;
  return 3;
}
