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
 *                      tools and knowledge that reach them. Below it, one
 *                      dynamic view per runtime scenario (arc42 section 6),
 *                      drawn as a sequence: the participants in a row in
 *                      the order they first take part, a lifeline under
 *                      each, and the numbered steps from top to bottom.
 *
 * Each stage's frame appears once the stage is reached, so the board grows
 * downwards as the session moves on and an approved stage stays readable
 * above the one being worked on. Pure and deterministic.
 */
import { CARD, fit, layoutBoard, type Box, type Layout, type LayoutEdge, type LayoutNode, type Point } from './layout';
import type { Board, StageId } from './schema';
import { stageOf } from './stages';

export type Frame = Box & { id: StageId; label: string };
/** A view inside a stage's frame, such as one dynamic view per runtime scenario. */
export type Panel = Box & { id: string; label: string };
export type Workspace = Layout & { frames: Frame[]; panels: Panel[] };

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


// Dynamic views: participant cards, the space between lifelines, the height of one step.
const SEQ = { w: 190, h: 72, col: 270, step: 58, pad: 32, header: 40 } as const;

/** What to draw for a scenario participant: a person or system from 3.2, a building block or a team. */
function participant(board: Board, id: string): Pick<LayoutNode, 'kind' | 'role' | 'title' | 'subtitle'> {
  const item = board.spec.items.find((i) => i.id === id);
  if (item) return item.type === 'person' ? { kind: 'actor', role: 'actor', title: fit(item.name ?? item.text, 40), subtitle: '' } : { kind: 'external', role: 'external', title: fit(item.name ?? item.text, 40), subtitle: '' };
  const c = board.components.find((x) => x.id === id);
  if (c) return { kind: c.kind, role: c.kind, title: fit(c.name, 40), subtitle: '' };
  const t = board.teams.find((x) => x.id === id);
  return { kind: 'system', role: 'system', title: fit(t?.name ?? id, 40), subtitle: t ? `${t.pattern.replace('_', ' ')} team` : '' };
}

/** One runtime scenario as a C4 dynamic view, drawn as a sequence. Its top-left corner is (x0, y0). */
function dynamicView(board: Board, sc: Board['spec']['scenarios'][number], index: number, x0: number, y0: number): { panel: Panel; nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const order: string[] = [];
  for (const st of sc.steps) for (const id of [st.from, st.to]) if (!order.includes(id)) order.push(id);
  const known = (id: string) => board.spec.items.some((i) => i.id === id) || board.components.some((c) => c.id === id) || board.teams.some((t) => t.id === id);
  const ids = order.filter(known);
  const cardsY = y0 + SEQ.header;
  const nodes: LayoutNode[] = ids.map((id, i) => ({ id: `dyn-${sc.id}-${id}`, ...participant(board, id), x: x0 + SEQ.pad + i * SEQ.col, y: cardsY, w: SEQ.w, h: SEQ.h }));
  const lifeX = new Map(ids.map((id, i) => [id, nodes[i].x + SEQ.w / 2]));
  const firstStep = cardsY + SEQ.h + SEQ.step * 0.75;
  const bottom = firstStep + Math.max(0, sc.steps.length - 1) * SEQ.step + SEQ.step * 0.6;
  const edges: LayoutEdge[] = nodes.map((n, i) => ({
    id: `dyn:${sc.id}|${ids[i]}`,
    points: [{ x: n.x + SEQ.w / 2, y: n.y + n.h }, { x: n.x + SEQ.w / 2, y: bottom }],
    label: '',
    style: 'dotted',
    kind: 'lifeline',
  }));
  sc.steps.forEach((st, n) => {
    const a = lifeX.get(st.from);
    const b = lifeX.get(st.to);
    if (a === undefined || b === undefined || a === b) return;
    const yy = firstStep + n * SEQ.step;
    edges.push({ id: `dyn:${sc.id}#${n + 1}`, points: [{ x: a, y: yy }, { x: b, y: yy }], label: fit(`${n + 1}. ${st.what}`, 38), style: 'solid', kind: 'flow' });
  });
  const w = Math.max(ids.length, 1) * SEQ.col - (SEQ.col - SEQ.w) + 2 * SEQ.pad;
  return { panel: { id: `dyn-${sc.id}`, label: `DYNAMIC VIEW · 6.${index + 1} ${sc.title.toUpperCase()}`, x: x0, y: y0, w, h: bottom - y0 + SEQ.pad / 2 }, nodes, edges };
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
    panels: [],
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
    // The dynamic views, one per scenario in the order of the user flows, below the container view.
    const containerBottom = Math.max(...out.nodes.filter((n) => !n.id.startsWith('ctx-')).map((n) => n.y + n.h), out.boundary ? out.boundary.y + out.boundary.h : 0, out.legend ? out.legend.y + out.legend.h : 0);
    let panelY = containerBottom + FRAME.gap;
    const flows = board.spec.items.filter((i) => i.type === 'flow').map((i) => i.id);
    const scenarios = [...board.spec.scenarios].sort((a, b) => flows.indexOf(a.flow) - flows.indexOf(b.flow));
    scenarios.forEach((sc, i) => {
      const v = dynamicView(board, sc, flows.indexOf(sc.flow) >= 0 ? flows.indexOf(sc.flow) : i, ORIGIN.x + FRAME.pad, panelY);
      out.panels.push(v.panel);
      out.nodes.push(...v.nodes);
      out.edges.push(...v.edges);
      panelY += v.panel.h + FRAME.gap / 2;
    });

    const contentNodes = out.nodes.filter((n) => !n.id.startsWith('ctx-'));
    const right = Math.max(...contentNodes.map((n) => n.x + n.w), ...out.teams.map((t) => t.x + t.w), ...out.panels.map((p) => p.x + p.w), out.boundary ? out.boundary.x + out.boundary.w : 0, out.legend ? out.legend.x + out.legend.w : 0);
    const bottom = Math.max(containerBottom, ...out.panels.map((p) => p.y + p.h));
    out.frames.push({
      id: 'solution',
      label: frameLabel(board, 'solution', 'CONTAINERS'),
      x: ORIGIN.x,
      y,
      w: Math.max(right - ORIGIN.x + FRAME.pad, 600),
      h: Math.max(bottom - y + FRAME.pad, FRAME.header + CARD.h),
    });
  }

  const all: Box[] = [...out.frames, ...out.panels, ...out.nodes, ...out.teams, ...out.bands, ...(out.legend ? [out.legend] : [])];
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
