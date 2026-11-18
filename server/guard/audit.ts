/**
 * An audit trail per session: every guard decision, every accepted or refused
 * change with its basis, every screened input. One JSON object per line, so
 * a session can be reviewed or replayed after the fact.
 *
 * Text from the user is cut to a short excerpt; the trail records decisions,
 * not conversations.
 */
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export type AuditEvent = {
  kind:
    | 'session_start'
    | 'brief_saved'
    | 'brief_refused'
    | 'change_accepted'
    | 'change_refused'
    | 'input_flagged'
    | 'input_unscreened'
    | 'docs_withheld'
    | 'docs_links_removed'
    | 'output_flagged';
  [key: string]: unknown;
};

const EXCERPT = 200;
export const excerpt = (text: string) => (text.length > EXCERPT ? `${text.slice(0, EXCERPT)}...` : text);

export class Audit {
  readonly events: Array<AuditEvent & { at: string; session: string }> = [];
  private ready: Promise<unknown> | null = null;

  constructor(readonly session: string, private readonly dir: string | null) {}

  record(event: AuditEvent) {
    const entry = { at: new Date().toISOString(), session: this.session, ...event };
    this.events.push(entry);
    if (event.kind !== 'change_accepted' && event.kind !== 'session_start') {
      console.log(`[Guard] ${event.kind}${event.reason ? `: ${String(event.reason)}` : ''}`);
    }
    if (!this.dir) return;
    const dir = this.dir;
    this.ready ??= mkdir(dir, { recursive: true }).catch(() => undefined);
    void this.ready
      .then(() => appendFile(path.join(dir, `${this.session}.jsonl`), `${JSON.stringify(entry)}\n`))
      .catch(() => undefined); // the trail must never take the call down
  }
}
