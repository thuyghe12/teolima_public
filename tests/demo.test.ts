import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_SCRIPT, compiledDemoScript, playDemo } from '../server/demo';

test('every demo drawing passes validation without dropped arguments', () => {
  assert.doesNotThrow(() => compiledDemoScript());
});

test('every connection in the demo points at a node drawn before it', () => {
  const drawn = new Set<string>();
  for (const step of DEMO_SCRIPT) {
    if (!('draw' in step)) continue;
    const args = step.draw.args as Record<string, string>;
    if (step.draw.name === 'draw_agent_node') drawn.add(args.label);
    if (step.draw.name === 'draw_connection') {
      assert.ok(drawn.has(args.fromNode), `fromNode "${args.fromNode}" is not on the board yet`);
      assert.ok(drawn.has(args.toNode), `toNode "${args.toNode}" is not on the board yet`);
    }
  }
});

test('the demo includes a human approval gate and a guardrail', () => {
  const roles = DEMO_SCRIPT.flatMap((s) => ('draw' in s && s.draw.name === 'draw_agent_node' ? [String(s.draw.args?.agentRole)] : []));
  assert.ok(roles.includes('human_approval'));
  assert.ok(roles.includes('guardrail'));
});

test('playback emits live-session message shapes and can be stopped', async () => {
  const sent: Array<{ type: string }> = [];
  const stop = playDemo((m) => sent.push(m as { type: string }), 1);
  await new Promise((r) => setTimeout(r, 900));
  stop();
  const count = sent.length;
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(sent.length, count, 'no messages after stop');
  assert.ok(sent.length > 0);
  assert.ok(sent.every((m) => m.type === 'transcript' || m.type === 'tool_call'));
});
