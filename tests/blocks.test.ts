import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, ENUM_BLOCKS, block, blockFor } from '../shared/catalog/blocks';
import { COMPONENT_KINDS, Component, Knowledge, Memory, Tool } from '../shared/board/schema';

test('every block has a name, product, compile meaning, source and check date', () => {
  const ids = new Set<string>();
  for (const b of BLOCKS) {
    assert.ok(!ids.has(b.id), `${b.id} is unique`);
    ids.add(b.id);
    for (const field of ['name', 'product', 'compiles', 'source'] as const) assert.ok(b[field].trim(), `${b.id} has ${field}`);
    assert.match(b.checked, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(b.source.startsWith('https://') || b.status === 'design_only', `${b.id} links to Microsoft documentation`);
  }
});

test('every value the board model allows maps onto a block (the coach cannot place anything else)', () => {
  for (const t of Tool.shape.toolType.removeDefault().options) assert.ok(block(ENUM_BLOCKS.tool[t]), `tool type ${t}`);
  for (const s of Knowledge.shape.source.removeDefault().options) assert.ok(block(ENUM_BLOCKS.knowledge[s]), `knowledge source ${s}`);
  for (const s of Memory.shape.store.removeDefault().options) assert.ok(block(ENUM_BLOCKS.memory[s]), `memory store ${s}`);
  const samples: Record<string, object> = { approval: { gates: 'x' } };
  for (const kind of COMPONENT_KINDS) {
    const b = blockFor(Component.parse({ id: 'x', name: 'X', kind, ...(samples[kind] ?? {}) }));
    assert.ok(b, kind);
  }
});

test('preview features are marked as preview', () => {
  assert.equal(block('foundry_memory').status, 'preview');
  assert.equal(block('a2a_tool').status, 'preview');
});
