/**
 * Server-side record of what is on the board, per session.
 *
 * Two jobs:
 * - stop duplicates: a component or connection that is already on the board
 *   is not drawn again; the model is told it already exists
 * - give the model spatial awareness without starting a new turn: the list
 *   of components goes back inside tool results, never as a user message
 *
 * The browser reports the real board after every change, so a component the
 * user erased by hand can be drawn again.
 */

export type BoardElementSummary = { type?: string; label?: string; role?: string; id?: string };

const norm = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export class BoardTracker {
  private nodes = new Map<string, string>();
  private edges = new Set<string>();

  /** Replaces the record with the board as the browser reports it. */
  syncFromCanvas(elements: BoardElementSummary[]) {
    this.nodes.clear();
    for (const el of elements) {
      const label = el.label || el.role;
      if (el.role && label) this.nodes.set(norm(label), String(label));
    }
  }

  clear() {
    this.nodes.clear();
    this.edges.clear();
  }

  /** Returns a reason when the call would duplicate something on the board. */
  duplicateReason(name: string, args: Record<string, unknown> = {}): string | null {
    if (name === 'draw_agent_node') {
      const key = norm(args.label);
      if (key && this.nodes.has(key)) return `"${this.nodes.get(key)}" is already on the board. Connect to it by this exact label instead of drawing it again.`;
    }
    if (name === 'draw_connection') {
      const key = `${norm(args.fromNode)}->${norm(args.toNode)}`;
      if (key !== '->' && this.edges.has(key)) return `This connection is already drawn.`;
    }
    return null;
  }

  /** Records a call that was forwarded to the browser. */
  record(name: string, args: Record<string, unknown> = {}) {
    if (name === 'clear_canvas') return this.clear();
    if (name === 'draw_agent_node' && args.label) this.nodes.set(norm(args.label), String(args.label));
    if (name === 'draw_connection' && args.fromNode && args.toNode) {
      this.edges.add(`${norm(args.fromNode)}->${norm(args.toNode)}`);
    }
  }

  /** Component labels currently on the board, for the model's context. */
  labels(limit = 40): string[] {
    return [...this.nodes.values()].slice(0, limit);
  }
}
