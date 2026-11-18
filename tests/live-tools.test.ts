import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Behavior, FunctionResponseScheduling } from '@google/genai';
import { declareTools, supportsAsyncTools, toolResponse } from '../server/live-tools';

test('3.1 Flash Live is treated as synchronous only, newer Live models as asynchronous', () => {
  assert.equal(supportsAsyncTools('gemini-3.1-flash-live-preview'), false);
  assert.equal(supportsAsyncTools('gemini-3.8-live'), true);
});

test('declarations are marked non-blocking only when the model supports it', () => {
  const decls = [{ name: 'add_component' }, { name: 'search_microsoft_docs' }];
  assert.ok(declareTools(decls, true).every((d) => d.behavior === Behavior.NON_BLOCKING));
  assert.ok(declareTools(decls, false).every((d) => d.behavior === undefined));
});

test('drawing results are silent so a finished drawing never starts a new turn', () => {
  const r = toolResponse({ id: '1', name: 'draw_agent_node' }, { success: true }, true);
  assert.equal(r.scheduling, FunctionResponseScheduling.SILENT);
  assert.deepEqual(r.response, { output: { success: true } });
});

test('documentation results are taken in when the model is idle', () => {
  assert.equal(toolResponse({ name: 'search_microsoft_docs' }, {}, true).scheduling, FunctionResponseScheduling.WHEN_IDLE);
  assert.equal(toolResponse({ name: 'add_component' }, {}, true).scheduling, FunctionResponseScheduling.SILENT);
});

test('synchronous models get responses without scheduling', () => {
  assert.equal(toolResponse({ name: 'draw_agent_node' }, {}, false).scheduling, undefined);
});
