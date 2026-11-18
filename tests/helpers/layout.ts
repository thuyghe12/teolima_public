import assert from 'node:assert/strict';
import type { Box, Layout, Point } from '../../shared/board/layout';

export const overlaps = (a: Box, b: Box, margin = 0) =>
  a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin;
export const inside = (inner: Box, outer: Box) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
export const onBorder = (p: Point, b: Box) =>
  (p.x >= b.x - 0.5 && p.x <= b.x + b.w + 0.5 && (Math.abs(p.y - b.y) < 0.5 || Math.abs(p.y - b.y - b.h) < 0.5)) ||
  (p.y >= b.y - 0.5 && p.y <= b.y + b.h + 0.5 && (Math.abs(p.x - b.x) < 0.5 || Math.abs(p.x - b.x - b.w) < 0.5));

/** True when the segment p-q passes through the interior of box b. */
export function crosses(p: Point, q: Point, b: Box): boolean {
  const pad = 1;
  const x1 = b.x + pad, x2 = b.x + b.w - pad, y1 = b.y + pad, y2 = b.y + b.h - pad;
  if (p.y === q.y) return p.y > y1 && p.y < y2 && Math.max(p.x, q.x) > x1 && Math.min(p.x, q.x) < x2;
  if (p.x === q.x) return p.x > x1 && p.x < x2 && Math.max(p.y, q.y) > y1 && Math.min(p.y, q.y) < y2;
  return false;
}

/** No two cards overlap, every connector is orthogonal and crosses no card it does not connect. */
export function assertClean(l: Layout) {
  for (let i = 0; i < l.nodes.length; i++)
    for (let j = i + 1; j < l.nodes.length; j++)
      assert.ok(!overlaps(l.nodes[i], l.nodes[j], 16), `${l.nodes[i].id} and ${l.nodes[j].id} keep 16px apart`);
  for (const e of l.edges) {
    for (let i = 1; i < e.points.length; i++) {
      const [p, q] = [e.points[i - 1], e.points[i]];
      assert.ok(p.x === q.x || p.y === q.y, `edge ${e.id} is orthogonal`);
      for (const n of l.nodes) {
        if (e.id.includes(n.id)) continue;
        assert.ok(!crosses(p, q, n), `edge ${e.id} does not cross ${n.id}`);
      }
    }
  }
}
