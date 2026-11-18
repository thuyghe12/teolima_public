import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_TOOLS, validateToolCall } from '../server/validation';

test('only the explaining tools are allowed', () => {
  assert.deepEqual([...ALLOWED_TOOLS].sort(), ['draw_callout', 'highlight_area']);
  for (const name of ['web_search', 'generate_sketch_illustration', 'draw_shape', 'clear_canvas']) {
    const r = validateToolCall({ name, args: {} });
    assert.equal(r.ok, false, name);
    assert.match(r.error ?? '', /Unknown tool/);
  }
});

test('accepts a callout and keeps valid arguments', () => {
  const r = validateToolCall({ id: '1', name: 'draw_callout', args: { text: 'Refunds over 100 EUR need a person', attachToNode: 'Refund approval', relativePosition: 'below' } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.call?.args, { text: 'Refunds over 100 EUR need a person', attachToNode: 'Refund approval', relativePosition: 'below' });
  assert.deepEqual(r.dropped, []);
});

test('rejects non-objects', () => {
  assert.equal(validateToolCall(null).ok, false);
  assert.equal(validateToolCall('draw_callout').ok, false);
});

test('clamps coordinates and sizes', () => {
  const r = validateToolCall({ name: 'highlight_area', args: { x: 1e9, y: -1e9, width: 99999, height: 0 } });
  assert.equal(r.call?.args?.x, 4000);
  assert.equal(r.call?.args?.y, -500);
  assert.equal(r.call?.args?.width, 1600);
  assert.equal(r.call?.args?.height, 4);
});

test('drops colours that are not colours', () => {
  const r = validateToolCall({ name: 'draw_callout', args: { text: 'hi', strokeColor: 'url(javascript:alert(1))', fillColor: 'rgba(200, 241, 58, 0.2)' } });
  assert.equal(r.call?.args?.strokeColor, undefined);
  assert.equal(r.call?.args?.fillColor, 'rgba(200, 241, 58, 0.2)');
  assert.deepEqual(r.dropped, ['strokeColor']);
});

test('drops non-numeric coordinates', () => {
  const r = validateToolCall({ name: 'highlight_area', args: { x: 'left', y: Number.NaN } });
  assert.equal(r.call?.args?.x, undefined);
  assert.equal(r.call?.args?.y, undefined);
  assert.deepEqual(r.dropped.sort(), ['x', 'y']);
});

test('caps text length and nested arrays', () => {
  const r = validateToolCall({ name: 'draw_callout', args: { text: 'a'.repeat(5000), extra: Array.from({ length: 100 }, (_, i) => i) } });
  assert.equal((r.call?.args?.text as string).length, 400);
  assert.equal((r.call?.args?.extra as unknown[]).length, 20);
});
