/**
 * The whole board as the stages draw it, top to bottom, one frame per stage.
 *
 *   1 Discovery        C4 system context: the system as one box, the people
 *                      who use it on the left, the external systems on the
 *                      right, each relationship labelled with what is
 *                      exchanged (arc42 section 3.2). Internals are left out.
 *   2 Solution design  the C4 container view, below it: the building blocks
 *                      inside the system boundary (layout.ts), with the same
 *                      people on the left, connected to where their work
 *                      enters, and the same external systems below the
 *                      tools and knowledge that reach them.
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
// wide enough for a relationship label between the columns
const COL_GAP = 280;
const ROW_GAP = 32;

function frameLabel(board: Board, id: StageId, view: string): string {
  const s = stageOf(id);
  const approval = board.stage.approvals.find((a) => a.stage === id);
  return `${s.n} · ${s.title.toUpperCase()} · ${view}${approval ? ` · APPROVED BY ${approval.by.toUpperCase()}` : ''}`;
}


/** An orthogonal route from the right of a to the left of b, turning at turnX. */
function route(a: Box, b: Box, turnX: number): Point[] {
  const s = { x: a.x + a.w, y: a.y + a.h / 2 };
  const t = { x: b.x, y: b.y + b.h / 2 };
  return Math.abs(s.y - t.y) < 1 ? [s, t] : [s, { x: turnX, y: s.y }, { x: turnX, y: t.y }, t];
}

/** The context diagram: users, the system, and the systems and data it touches. */
function contextDiagram(board: Board, x0: number, y0: number): { nodes: LayoutNode[]; edges: LayoutEdge[]; bottom: number; right: number } {
  const users = board.spec.items.filter((i) => i.section === '3.2' && i.type === 'person');
  const systems = board.spec.items.filter((i) => i.section === '3.2' && i.type === 'system');
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
      subtitle: '',
      x,
      y: midY - colH(items.length) / 2 + i * (CARD.h + ROW_GAP),
      w: CARD.w,
      h: CARD.h,
    }));
  const actors = column(users, x0, 'actor');
  const externals = column(systems, sysX + SYSTEM.w + COL_GAP, 'external');

  const edges: LayoutEdge[] = [];
  // The fan-out turns close to the system box, so each relationship's long
  // horizontal run sits at its neighbour's height and carries its own label.
  const TURN = 36;
  // C4 labels every relationship with what it is for.
  const relation = (id: string) => fit(board.spec.items.find((i) => `ctx-${i.id}` === id)?.text ?? '', 34);
  for (const a of actors) edges.push({ id: `ctx:${a.id}>system`, points: route(a, system, system.x - TURN), label: relation(a.id), style: 'solid', kind: 'flow' });
  for (const e of externals) edges.push({ id: `ctx:system>${e.id}`, points: route(system, e, system.x + system.w + TURN), label: relation(e.id), style: 'solid', kind: 'flow' });

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
  if (board.brief.goal || board.spec.items.length) {
    const ctx = contextDiagram(board, ORIGIN.x + FRAME.pad, y + FRAME.header);
    out.nodes.push(...ctx.nodes);
    out.edges.push(...ctx.edges);
    const frame: Frame = {
      id: 'discovery',
      label: frameLabel(board, 'discovery', 'SYSTEM CONTEXT'),
      x: ORIGIN.x,
      y,
      w: ctx.right - ORIGIN.x + FRAME.pad,
      h: ctx.bottom - y + FRAME.pad,
    };
    out.frames.push(frame);
    y = frame.y + frame.h + FRAME.gap;
  }

  // 2. Solution design: the container view, below discovery, once the stage is reached.
  if (stageN >= 2 || board.components.length) {
    const design = layoutBoard({ ...board, title: '' });
    const persons = board.spec.items.filter((i) => i.section === '3.2' && i.type === 'person');
    const systems = board.spec.items.filter((i) => i.section === '3.2' && i.type === 'system');
    const drawn: Box[] = [...(design.boundary ? [design.boundary] : []), ...design.nodes, ...design.teams];
    const top = Math.min(...drawn.map((b) => b.y), design.bounds.y);
    const left = Math.min(...drawn.map((b) => b.x), design.bounds.x);
    // people get a column of their own on the left
    const personCol = ORIGIN.x + FRAME.pad;
    const dx = (persons.length ? personCol + CARD.w + COL_GAP : ORIGIN.x + FRAME.pad) - left;
    const dy = y + FRAME.header - top;
    const move = (b: Box) => ({ x: b.x + dx, y: b.y + dy });
    out.nodes.push(...design.nodes.map((n) => ({ ...n, ...move(n) })));
    out.teams.push(...design.teams.map((t) => ({ ...t, ...move(t) })));
    out.bands.push(...design.bands.map((b) => ({ ...b, ...move(b) })));
    out.edges.push(...design.edges.map((e) => ({ ...e, points: e.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) })));
    out.boundary = design.boundary ? { ...design.boundary, ...move(design.boundary) } : null;
    const placed = new Map(out.nodes.map((n) => [n.id, n]));

    // People, connected to the entry point that serves them, else to every entry point.
    const triggers = out.nodes.filter((n) => n.kind === 'trigger');
    const midY = triggers.length ? triggers.reduce((a, t) => a + t.y + t.h / 2, 0) / triggers.length : y + FRAME.header + CARD.h;
    persons.forEach((p, i) => {
      const node: LayoutNode = {
        id: `c2-${p.id}`,
        kind: 'actor',
        role: 'actor',
        title: fit(p.name ?? p.text, 40),
        subtitle: '',
        x: personCol,
        y: midY - (persons.length * (CARD.h + ROW_GAP) - ROW_GAP) / 2 + i * (CARD.h + ROW_GAP),
        w: CARD.w,
        h: CARD.h,
      };
      out.nodes.push(node);
      const entries = board.components.filter((c) => c.kind === 'trigger' && c.serves.includes(p.id));
      for (const t of entries.length ? entries : board.components.filter((c) => c.kind === 'trigger')) {
        const target = placed.get(t.id);
        if (target) out.edges.push({ id: `c2:${p.id}>${t.id}`, points: route(node, target, target.x - 24), label: fit(p.text, 34), style: 'solid', kind: 'flow' });
      }
    });

    // External systems below the system, each under the first tool or knowledge source that reaches it.
    const boundaryBottom = Math.max(...out.nodes.filter((n) => !n.id.startsWith('ctx-')).map((n) => n.y + n.h), out.boundary ? out.boundary.y + out.boundary.h : 0);
    const sysY = boundaryBottom + FRAME.gap;
    const taken: Box[] = [];
    for (const sys of systems) {
      const reachers = board.components.filter((c) => (c.kind === 'tool' || c.kind === 'knowledge') && c.serves.includes(sys.id)).map((c) => placed.get(c.id)).filter((n): n is LayoutNode => !!n);
      let x = reachers[0]?.x ?? (taken.length ? taken[taken.length - 1].x + CARD.w + ROW_GAP : personCol + CARD.w + COL_GAP);
      while (taken.some((b) => Math.abs(b.x - x) < CARD.w + ROW_GAP)) x += CARD.w + ROW_GAP;
      const node: LayoutNode = { id: `c2-${sys.id}`, kind: 'external', role: 'external', title: fit(sys.name ?? sys.text, 40), subtitle: '', x, y: sysY, w: CARD.w, h: CARD.h };
      taken.push(node);
      out.nodes.push(node);
      for (const r of reachers) {
        const s0 = { x: r.x + r.w / 2, y: r.y + r.h };
        const t0 = { x: node.x + node.w / 2, y: node.y };
        const midY2 = sysY - FRAME.gap / 2;
        out.edges.push({
          id: `c2:${r.id}>${sys.id}`,
          points: Math.abs(s0.x - t0.x) < 1 ? [s0, t0] : [s0, { x: s0.x, y: midY2 }, { x: t0.x, y: midY2 }, t0],
          label: fit(sys.text, 34),
          style: 'solid',
          kind: 'flow',
        });
      }
    }

    out.legend = design.legend ? { ...design.legend, x: design.legend.x + dx, y: (taken.length ? sysY + CARD.h : design.legend.y + dy) + (taken.length ? 48 : 0) } : null;
    const contentNodes = out.nodes.filter((n) => !n.id.startsWith('ctx-'));
    const right = Math.max(...contentNodes.map((n) => n.x + n.w), ...out.teams.map((t) => t.x + t.w), out.boundary ? out.boundary.x + out.boundary.w : 0, out.legend ? out.legend.x + out.legend.w : 0);
    const bottom = Math.max(...contentNodes.map((n) => n.y + n.h), out.boundary ? out.boundary.y + out.boundary.h : 0, out.legend ? out.legend.y + out.legend.h : 0);
    out.frames.push({
      id: 'solution',
      label: frameLabel(board, 'solution', 'CONTAINERS'),
      x: ORIGIN.x,
      y,
      w: Math.max(right - ORIGIN.x + FRAME.pad, 600),
      h: Math.max(bottom - y + FRAME.pad, FRAME.header + CARD.h),
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
