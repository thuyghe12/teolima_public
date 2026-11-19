/**
 * Compiles the demo design into ./out/<name>: the project a solutions
 * architect would hand over after the demo session, technical design
 * approved and the wizard answered. CI builds its Bicep.
 *
 *   npm run compile:example [-- <out dir>]
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DEMO_SCRIPT } from '../server/demo';
import { compile } from '../server/compile';
import { applyChange, type Change } from '../shared/board/changes';
import { emptyBoard } from '../shared/board/schema';

const at = '2026-11-19T12:00:00.000Z';
let board = emptyBoard();
const changes: Change[] = [];
const apply = (c: Change) => {
  const r = applyChange(board, c);
  if (!r.ok) throw new Error(`Refused: ${'error' in r ? r.error : ''}`);
  board = r.board;
  changes.push(c);
};
for (const step of DEMO_SCRIPT) if ('change' in step) apply({ body: step.change, actor: step.actor ?? 'coach', reason: step.reason, at, ...(step.basis ? { basis: step.basis } : {}) });
apply({ body: { op: 'approve_stage', stage: 'technical', by: 'Security lead' }, actor: 'user', reason: 'Approved in the app', at });

const agents = board.components.filter((c) => c.kind === 'agent');
const result = compile({
  board,
  changes,
  answers: {
    agentModels: Object.fromEntries(agents.map((a) => [a.id, 'gpt-4.1'])),
    models: { 'gpt-4.1': { version: '2025-04-14', sku: 'GlobalStandard', capacity: 50 } },
  },
});
if ('reason' in result) throw new Error(result.reason);
const out = join(process.argv[2] ?? 'out', 'customer-support');
rmSync(out, { recursive: true, force: true });
for (const f of result.files) {
  mkdirSync(dirname(join(out, f.path)), { recursive: true });
  writeFileSync(join(out, f.path), f.content);
}
console.log(`Compiled ${result.files.length} files to ${out}`);
