/**
 * The whole board as the stages draw it, top to bottom, one frame per stage.
 *
 *   1 Discovery        context diagram: the system as one box, its users on
 *                      the left, the systems and data it touches on the right.
 *                      Internals are deliberately left out.
 *   2 Solution design  the high-level design (layout.ts), below it.
 *
 * Each stage's frame appears once the stage is reached, so the board grows
 * downwards as the session moves on and an approved stage stays readable
 * above the one being worked on. Pure and deterministic.
 */
import { CARD, fit, layoutBoard, type Box, type Layout, type LayoutEdge, type LayoutNode, type Point } from './layout';
import type { Board, StageId } from './schema';
import { stageOf } from './stages';

export type Frame = Box & { id: StageId; label: string };
export type Workspace = Layout & { frames: Frame[] };

const ORIGIN = { x: 80, y: 150 } as const;
const FRAME = { pad: 40, header: 56, gap: 96 } as const;
const SYSTEM = { w: 280, h: 150 } as const;
const COL_GAP = 150;
const ROW_GAP = 32;

function frameLabel(board: Board, id: StageId, view: string): string {
  const s = stageOf(id);
  const approval = board.stage.approvals.find((a) => a.stage === id);
  return `${s.n} · ${s.title.toUpperCase()} · ${view}${approval ? ` · APPROVED BY ${approval.by.toUpperCase()}` : ''}`;
}

const shiftPoint = (p: Point, dy: number): Point => ({ x: p.x, y: p.y + dy });
const shiftBox = <T extends Box>(b: T, dy: number): T => ({ ...b, y: b.y + dy });

/** The context diagram: users, the system, and the systems and data it touches. */
function contextDiagram(board: Board, x0: number, y0: number): { nodes: LayoutNode[]; edges: LayoutEdge[]; bottom: number; right: number } {
  const users = board.spec.requirements.filter((r) => r.kind === 'user');
  const systems = board.spec.requirements.filter((r) => r.kind === 'integration');
  const colH = (n: number) => n * CARD.h + Math.max(0, n - 1) * ROW_GAP;
  const h = Math.max(SYSTEM.h, colH(users.length), colH(systems.length));
  const midY = y0 + h / 2;

  const sysX = x0 + (users.length ? CARD.w + COL_GAP : 0);
  const system: LayoutNode = {
    id: 'ctx-system',
    kind: 'system',
    role: 'system',
    title: fit(board.title || 'The system', 40),
    subtitle: fit(board.brief.goal, 60),
    x: sysX,
    y: midY - SYSTEM.h / 2,
    w: SYSTEM.w,
    h: SYSTEM.h,
  };
  const column = (items: typeof users, x: number, kind: 'actor' | 'external'): LayoutNode[] =>
    items.map((r, i) => ({
      id: `ctx-${r.id}`,
      kind,
      role: kind,
      title: fit(r.name ?? r.text, 40),
      subtitle: r.name ? fit(r.text, 46) : '',
      x,
      y: midY - colH(items.length) / 2 + i * (CARD.h + ROW_GAP),
      w: CARD.w,
      h: CARD.h,
    }));
  const actors = column(users, x0, 'actor');
  const externals = column(systems, sysX + SYSTEM.w + COL_GAP, 'external');

  const edges: LayoutEdge[] = [];
  const route = (a: Box, b: Box): Point[] => {
    const s = { x: a.x + a.w, y: a.y + a.h / 2 };
    const t = { x: b.x, y: b.y + b.h / 2 };
    const mx = (s.x + t.x) / 2;
    return Math.abs(s.y - t.y) < 1 ? [s, t] : [s, { x: mx, y: s.y }, { x: mx, y: t.y }, t];
  };
  for (const a of actors) edges.push({ id: `ctx:${a.id}>system`, points: route(a, system), label: '', style: 'solid', kind: 'flow' });
  for (const e of externals) edges.push({ id: `ctx:system>${e.id}`, points: route(system, e), label: '', style: 'solid', kind: 'flow' });

  const nodes = [...actors, system, ...externals];
  return {
    nodes,
    edges,
    bottom: y0 + h,
    right: Math.max(...nodes.map((n) => n.x + n.w)),
  };
}

export function layoutWorkspace(board: Board): Workspace {
  const out: Workspace = {
    title: board.title ? { text: board.title, x: ORIGIN.x, y: ORIGIN.y - 56 } : null,
    boundary: null,
    bands: [],
    nodes: [],
    teams: [],
    edges: [],
    legend: null,
    frames: [],
    bounds: { x: ORIGIN.x, y: ORIGIN.y, w: CARD.w, h: CARD.h },
  };
  const stageN = stageOf(board.stage.current).n;
  let y = ORIGIN.y;

  // 1. Discovery: the context diagram, once there is a goal or a requirement.
  if (board.brief.goal || board.spec.requirements.length) {
    const ctx = contextDiagram(board, ORIGIN.x + FRAME.pad, y + FRAME.header);
    out.nodes.push(...ctx.nodes);
    out.edges.push(...ctx.edges);
    const frame: Frame = {
      id: 'discovery',
      label: frameLabel(board, 'discovery', 'CONTEXT'),
      x: ORIGIN.x,
      y,
      w: ctx.right - ORIGIN.x + FRAME.pad,
      h: ctx.bottom - y + FRAME.pad,
    };
    out.frames.push(frame);
    y = frame.y + frame.h + FRAME.gap;
  }

  // 2. Solution design: the high-level design, below discovery, once the stage is reached.
  if (stageN >= 2 || board.components.length) {
    const design = layoutBoard({ ...board, title: '' });
    const drawn: Box[] = [...(design.boundary ? [design.boundary] : []), ...design.nodes, ...design.teams];
    const top = Math.min(...drawn.map((b) => b.y), design.bounds.y);
    const dy = y + FRAME.header - top;
    out.nodes.push(...design.nodes.map((n) => shiftBox(n, dy)));
    out.teams.push(...design.teams.map((t) => shiftBox(t, dy)));
    out.bands.push(...design.bands.map((b) => shiftBox(b, dy)));
    out.edges.push(...design.edges.map((e) => ({ ...e, points: e.points.map((p) => shiftPoint(p, dy)) })));
    out.boundary = design.boundary ? shiftBox(design.boundary, dy) : null;
    out.legend = design.legend ? shiftBox(design.legend, dy) : null;
    const contentRight = design.bounds.x + design.bounds.w;
    const contentBottom = design.bounds.y + design.bounds.h + dy;
    out.frames.push({
      id: 'solution',
      label: frameLabel(board, 'solution', 'HIGH-LEVEL DESIGN'),
      x: ORIGIN.x,
      y,
      w: Math.max(contentRight - ORIGIN.x + FRAME.pad, 600),
      h: Math.max(contentBottom - y + FRAME.pad, FRAME.header + CARD.h),
    });
  }

  const all: Box[] = [...out.frames, ...out.nodes, ...out.teams, ...out.bands, ...(out.legend ? [out.legend] : [])];
  if (all.length) {
    const minX = Math.min(...all.map((b) => b.x));
    const minY = Math.min(...all.map((b) => b.y));
    const maxX = Math.max(...all.map((b) => b.x + b.w));
    const maxY = Math.max(...all.map((b) => b.y + b.h));
    out.bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return out;
}

/** The frame of the stage being worked on, to pan to; the last frame if that stage draws none yet. */
export function currentFrame(ws: Workspace, board: Board): Frame | null {
  return ws.frames.find((f) => f.id === board.stage.current) ?? ws.frames.at(-1) ?? null;
}
