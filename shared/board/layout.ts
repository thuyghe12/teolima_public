/**
 * Layout: positions for everything on the board, computed from the board model.
 *
 * The model never chooses coordinates. Reading left to right:
 *
 *   triggers | guardrails lane on top, then one container per team | outputs
 *
 * Inside a team container, agents are placed by orchestration pattern, and the
 * tools, knowledge sources and approvals the team uses sit in a lane below them:
 *
 *   sequential   agents in a row, in execution order, each passing to the next
 *   concurrent   agents in a column, fanned out from the team input and back in
 *   handoff      the start agent on the left, the agents it hands off to on the right
 *   group chat   the manager on top, the participants in a row below it
 *   magentic     same as group chat
 *
 * Connections are routed orthogonally through the gaps between columns. Edges
 * inside a team carry no labels: the team header names the pattern, and the
 * cards say what they are.
 * The function is pure and deterministic: the same board always gives the same layout.
 */
import type { Board, Component, OrchestrationPattern, Team } from './schema';

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

export type LayoutNode = Box & { id: string; kind: Component['kind']; role: string; title: string; subtitle: string };
export type LayoutTeam = Box & { id: string; title: string; pattern: OrchestrationPattern | 'none'; label: string };
export type LayoutEdge = {
  id: string;
  points: Point[];
  label: string;
  style: 'solid' | 'dashed' | 'dotted';
  kind: 'flow' | 'pattern' | 'uses' | 'approval';
};
export type Layout = {
  title: { text: string; x: number; y: number } | null;
  nodes: LayoutNode[];
  teams: LayoutTeam[];
  edges: LayoutEdge[];
  bounds: Box;
};

export const CARD = { w: 210, h: 120 } as const;
const GAP = { col: 110, row: 40, inner: 80, lane: 56 } as const;
const TEAM_PAD = 28;
const TEAM_HEADER = 44;
const ORIGIN = { x: 80, y: 150 } as const;

const PATTERN_LABEL: Record<OrchestrationPattern | 'none', string> = {
  sequential: 'SEQUENTIAL',
  concurrent: 'CONCURRENT',
  handoff: 'HANDOFF',
  group_chat: 'GROUP CHAT',
  magentic: 'MAGENTIC',
  none: 'NO TEAM YET',
};

const TOOL_LABEL: Record<string, string> = {
  function: 'Function tool',
  mcp: 'MCP server',
  openapi: 'OpenAPI tool',
  web_search: 'Web search',
  code_interpreter: 'Code interpreter',
  file_search: 'File search',
};
const SOURCE_LABEL: Record<string, string> = { ai_search: 'AI Search', file_search: 'File search', web: 'Web' };
const CONTROL_LABEL: Record<string, string> = {
  prompt_shields: 'Prompt Shields',
  harm_filters: 'harm filters',
  groundedness: 'groundedness',
  protected_material: 'protected material',
};

/** Shortens text to fit a card: whole words, an ellipsis when cut. */
export function fit(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  // the cut already ends on a word boundary: keep the last word whole
  if (t.charAt(max - 1) === ' ') return `${cut.trimEnd()}…`;
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function subtitleFor(c: Component, board: Board): string {
  switch (c.kind) {
    case 'agent':
      return c.description || c.instructions || (c.tools.length ? `${c.tools.length} tool${c.tools.length > 1 ? 's' : ''}` : '');
    case 'tool':
      return c.description || TOOL_LABEL[c.toolType] || '';
    case 'knowledge':
      return c.description || SOURCE_LABEL[c.source] || '';
    case 'guardrail': {
      const controls = c.controls.map((k) => CONTROL_LABEL[k] ?? k).join(', ');
      const scope = c.appliesTo.length
        ? c.appliesTo.map((id) => board.components.find((x) => x.id === id)?.name ?? id).join(', ')
        : 'all agents';
      return `${controls} · ${scope}`;
    }
    case 'approval':
      return c.condition;
    case 'trigger':
      return c.description || c.source;
    case 'output':
      return c.description || c.destination;
  }
}

function card(c: Component, board: Board, x: number, y: number, role?: string): LayoutNode {
  return {
    id: c.id,
    kind: c.kind,
    role: role ?? c.kind,
    title: fit(c.name, 40),
    subtitle: fit(subtitleFor(c, board), 46),
    x,
    y,
    w: CARD.w,
    h: CARD.h,
  };
}

const right = (b: Box): Point => ({ x: b.x + b.w, y: b.y + b.h / 2 });
const left = (b: Box): Point => ({ x: b.x, y: b.y + b.h / 2 });
const top = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y });
const bottom = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h });

/** An orthogonal route from the right side of `a` to the left side of `b`, through the gap at `channelX`. */
function elbow(a: Box, b: Box, channelX?: number): Point[] {
  const s = right(a);
  const t = left(b);
  if (t.x > s.x) {
    const mx = channelX ?? (s.x + t.x) / 2;
    return s.y === t.y ? [s, t] : [s, { x: mx, y: s.y }, { x: mx, y: t.y }, t];
  }
  // target sits to the left: go out right, down below both, and back in from the left
  const below = Math.max(a.y + a.h, b.y + b.h) + GAP.row;
  return [s, { x: s.x + 24, y: s.y }, { x: s.x + 24, y: below }, { x: t.x - 24, y: below }, { x: t.x - 24, y: t.y }, t];
}

/** A vertical route from the bottom of `a` to the top of `b`. */
function drop(a: Box, b: Box): Point[] {
  const s = bottom(a);
  const t = top(b);
  if (Math.abs(s.x - t.x) < 1) return [s, t];
  const my = (s.y + t.y) / 2;
  return [s, { x: s.x, y: my }, { x: t.x, y: my }, t];
}

type TeamBlock = { team: LayoutTeam; nodes: LayoutNode[]; edges: LayoutEdge[] };

/** Places one team (or the agents without a team) with its resource lane, at (x, y). */
function placeTeam(board: Board, team: Team | null, agents: Component[], x: number, y: number): TeamBlock {
  const pattern: OrchestrationPattern | 'none' = team?.pattern ?? 'none';
  const ix = x + TEAM_PAD;
  const iy = y + TEAM_HEADER;
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const teamId = team?.id ?? 'no-team';
  const byId = new Map(agents.map((a) => [a.id, a]));
  let innerW = 0;
  let innerH = 0;

  if (pattern === 'group_chat' || pattern === 'magentic') {
    const manager = team?.manager ? board.components.find((c) => c.id === team.manager) : undefined;
    const others = agents.filter((a) => a.id !== manager?.id);
    const rowW = Math.max(1, others.length) * CARD.w + Math.max(0, others.length - 1) * GAP.row;
    innerW = Math.max(rowW, CARD.w);
    let rowY = iy;
    let managerNode: LayoutNode | undefined;
    if (manager) {
      managerNode = card(manager, board, ix + (innerW - CARD.w) / 2, iy, 'manager');
      nodes.push(managerNode);
      rowY = iy + CARD.h + GAP.inner;
    }
    others.forEach((a, i) => {
      const n = card(a, board, ix + (innerW - rowW) / 2 + i * (CARD.w + GAP.row), rowY);
      nodes.push(n);
      if (managerNode) edges.push({ id: `${teamId}:${manager!.id}>${a.id}`, points: drop(managerNode, n), label: '', style: 'dashed', kind: 'pattern' });
    });
    innerH = rowY - iy + (others.length ? CARD.h : 0);
  } else if (pattern === 'handoff') {
    const start = team?.startAgent ? byId.get(team.startAgent) : agents[0];
    const others = agents.filter((a) => a.id !== start?.id);
    const colH = Math.max(1, others.length) * CARD.h + Math.max(0, others.length - 1) * GAP.row;
    innerH = Math.max(colH, CARD.h);
    const startNode = start ? card(start, board, ix, iy + (innerH - CARD.h) / 2) : undefined;
    if (startNode) nodes.push(startNode);
    const colX = ix + (startNode ? CARD.w + GAP.inner : 0);
    others.forEach((a, i) => {
      const n = card(a, board, colX, iy + (innerH - colH) / 2 + i * (CARD.h + GAP.row));
      nodes.push(n);
      if (startNode) edges.push({ id: `${teamId}:${start!.id}>${a.id}`, points: elbow(startNode, n), label: '', style: 'dashed', kind: 'pattern' });
    });
    innerW = colX - ix + (others.length ? CARD.w : 0);
  } else if (pattern === 'concurrent') {
    const colH = agents.length * CARD.h + Math.max(0, agents.length - 1) * GAP.row;
    innerW = CARD.w + 2 * (GAP.inner / 2);
    innerH = colH;
    const cx = ix + GAP.inner / 2;
    const fanIn = { x: ix, y: iy + colH / 2 };
    const fanOut = { x: ix + innerW, y: iy + colH / 2 };
    agents.forEach((a, i) => {
      const n = card(a, board, cx, iy + i * (CARD.h + GAP.row));
      nodes.push(n);
      const l = left(n);
      const r = right(n);
      edges.push({ id: `${teamId}:in>${a.id}`, points: [fanIn, { x: fanIn.x + 16, y: fanIn.y }, { x: fanIn.x + 16, y: l.y }, l], label: '', style: 'solid', kind: 'pattern' });
      edges.push({ id: `${teamId}:${a.id}>out`, points: [r, { x: fanOut.x - 16, y: r.y }, { x: fanOut.x - 16, y: fanOut.y }, fanOut], label: '', style: 'solid', kind: 'pattern' });
    });
  } else {
    // sequential, or agents without a team: a row in list order
    agents.forEach((a, i) => {
      const n = card(a, board, ix + i * (CARD.w + GAP.inner), iy);
      nodes.push(n);
      if (pattern === 'sequential' && i > 0) {
        const prev = nodes[i - 1];
        edges.push({ id: `${teamId}:${prev.id}>${a.id}`, points: [right(prev), left(n)], label: 'then', style: 'solid', kind: 'pattern' });
      }
    });
    innerW = agents.length * CARD.w + Math.max(0, agents.length - 1) * GAP.inner;
    innerH = agents.length ? CARD.h : 0;
  }

  // Resource lane: tools and knowledge the team's agents use, each approval next to what it gates.
  const agentNodes = new Map(nodes.map((n) => [n.id, n]));
  const resourceIds: string[] = [];
  for (const a of agents) {
    if (a.kind !== 'agent') continue;
    for (const id of [...a.tools, ...a.knowledge]) if (!resourceIds.includes(id)) resourceIds.push(id);
  }
  const lane: Component[] = [];
  for (const id of resourceIds) {
    for (const ap of board.components) if (ap.kind === 'approval' && ap.gates === id) lane.push(ap);
    const r = board.components.find((c) => c.id === id);
    if (r) lane.push(r);
  }
  for (const ap of board.components) {
    if (ap.kind === 'approval' && agentNodes.has(ap.gates) && !lane.includes(ap)) lane.push(ap);
  }

  if (lane.length) {
    const laneY = iy + innerH + GAP.lane;
    const laneNodes = new Map<string, LayoutNode>();
    lane.forEach((c, i) => {
      const n = card(c, board, ix + i * (CARD.w + GAP.row), laneY);
      nodes.push(n);
      laneNodes.set(c.id, n);
    });
    innerW = Math.max(innerW, lane.length * CARD.w + (lane.length - 1) * GAP.row);
    innerH = laneY - iy + CARD.h;

    // "Uses" lines leave each agent on its right, run down the gap beside it to a
    // channel above the lane, then drop onto the resource: they never cross a card.
    const channelY = laneY - GAP.lane / 2;
    for (const a of agents) {
      if (a.kind !== 'agent') continue;
      const from = agentNodes.get(a.id);
      for (const id of [...a.tools, ...a.knowledge]) {
        const to = laneNodes.get(id);
        if (!from || !to) continue;
        const s = right(from);
        const gx = s.x + 16;
        const t = top(to);
        edges.push({
          id: `${teamId}:${a.id}~${id}`,
          points: [s, { x: gx, y: s.y }, { x: gx, y: channelY }, { x: t.x, y: channelY }, t],
          label: '',
          style: 'dotted',
          kind: 'uses',
        });
      }
    }
    for (const c of lane) {
      if (c.kind !== 'approval') continue;
      const from = laneNodes.get(c.id)!;
      const gatedTool = laneNodes.get(c.gates);
      const gatedAgent = agentNodes.get(c.gates);
      if (gatedTool) edges.push({ id: `${teamId}:${c.id}!${c.gates}`, points: [right(from), left(gatedTool)], label: '', style: 'dashed', kind: 'approval' });
      else if (gatedAgent) edges.push({ id: `${teamId}:${c.id}!${c.gates}`, points: [top(from), { x: top(from).x, y: bottom(gatedAgent).y + 20 }, { x: bottom(gatedAgent).x, y: bottom(gatedAgent).y + 20 }, bottom(gatedAgent)], label: '', style: 'dashed', kind: 'approval' });
    }
  }

  const w = Math.max(innerW, CARD.w) + 2 * TEAM_PAD;
  const h = TEAM_HEADER + innerH + TEAM_PAD;
  const title = team?.name ?? 'Agents';
  return {
    team: { id: teamId, title, pattern, label: `${PATTERN_LABEL[pattern]} · ${fit(title, 40)}`, x, y, w, h },
    nodes,
    edges,
  };
}

/** Lays out a board. Pure and deterministic. */
export function layoutBoard(board: Board): Layout {
  const nodes: LayoutNode[] = [];
  const teams: LayoutTeam[] = [];
  const edges: LayoutEdge[] = [];
  const of = <K extends Component['kind']>(kind: K) => board.components.filter((c) => c.kind === kind) as Extract<Component, { kind: K }>[];

  const colTeams = ORIGIN.x + CARD.w + GAP.col;
  let y = ORIGIN.y;

  // Guardrails lane above the teams.
  const guardrails = of('guardrail');
  guardrails.forEach((g, i) => nodes.push(card(g, board, colTeams + i * (CARD.w + GAP.row), y)));
  if (guardrails.length) y += CARD.h + GAP.lane;

  // Teams, then agents without a team, then anything used by nobody.
  const placed = new Set<string>();
  const blocks: TeamBlock[] = [];
  for (const team of board.teams) {
    const agents = team.members.map((id) => board.components.find((c) => c.id === id)).filter((c): c is Component => !!c);
    const block = placeTeam(board, team, agents, colTeams, y);
    blocks.push(block);
    y = block.team.y + block.team.h + GAP.lane;
  }
  const inTeam = new Set(board.teams.flatMap((t) => [...t.members, ...(t.manager ? [t.manager] : [])]));
  const loose = of('agent').filter((a) => !inTeam.has(a.id));
  if (loose.length) {
    const block = placeTeam(board, null, loose, colTeams, y);
    blocks.push(block);
    y = block.team.y + block.team.h + GAP.lane;
  }
  for (const b of blocks) {
    teams.push(b.team);
    nodes.push(...b.nodes);
    edges.push(...b.edges);
    b.nodes.forEach((n) => placed.add(n.id));
  }
  guardrails.forEach((g) => placed.add(g.id));

  const unplaced = board.components.filter((c) => !placed.has(c.id) && (c.kind === 'tool' || c.kind === 'knowledge' || c.kind === 'approval'));
  unplaced.forEach((c, i) => nodes.push(card(c, board, colTeams + i * (CARD.w + GAP.row), y)));
  const teamsBottom = unplaced.length ? y + CARD.h : y - GAP.lane;

  const teamsRight = Math.max(
    colTeams + CARD.w,
    ...teams.map((t) => t.x + t.w),
    ...nodes.filter((n) => n.x >= colTeams).map((n) => n.x + n.w),
  );
  const middleY = ORIGIN.y + Math.max(0, (teamsBottom - ORIGIN.y - CARD.h) / 2);

  // Triggers on the left, outputs on the right, centred on the middle column.
  const column = (items: Component[], x: number) => {
    const h = items.length * CARD.h + Math.max(0, items.length - 1) * GAP.row;
    const y0 = Math.max(ORIGIN.y, middleY + CARD.h / 2 - h / 2);
    items.forEach((c, i) => nodes.push(card(c, board, x, y0 + i * (CARD.h + GAP.row))));
  };
  column(of('trigger'), ORIGIN.x);
  const colOutputs = teamsRight + GAP.col;
  column(of('output'), colOutputs);

  // Explicit connections, between components or whole teams.
  const boxes = new Map<string, Box>([...nodes.map((n) => [n.id, n] as const), ...teams.map((t) => [t.id, t] as const)]);
  for (const c of board.connections) {
    const a = boxes.get(c.from);
    const b = boxes.get(c.to);
    if (!a || !b) continue;
    const fromTriggers = a.x < colTeams;
    const toOutputs = b.x >= colOutputs;
    const channel = fromTriggers ? ORIGIN.x + CARD.w + GAP.col / 2 : toOutputs ? teamsRight + GAP.col / 2 : undefined;
    edges.push({ id: c.id, points: elbow(a, b, channel), label: c.label, style: 'solid', kind: 'flow' });
  }

  const all: Box[] = [...nodes, ...teams];
  const minX = Math.min(ORIGIN.x, ...all.map((b) => b.x));
  const minY = Math.min(ORIGIN.y, ...all.map((b) => b.y));
  const maxX = Math.max(ORIGIN.x + CARD.w, ...all.map((b) => b.x + b.w));
  const maxY = Math.max(ORIGIN.y + CARD.h, ...all.map((b) => b.y + b.h), ...edges.flatMap((e) => e.points.map((p) => p.y)));

  return {
    title: board.title ? { text: board.title, x: ORIGIN.x, y: ORIGIN.y - 56 } : null,
    nodes,
    teams,
    edges,
    bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
  };
}
