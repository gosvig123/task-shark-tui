import { validateToolArguments } from '@earendil-works/pi-ai';
import assert from 'node:assert/strict';
export default function boardSchemaProbe(pi) {
  pi.on('session_start', (_event, ctx) => {
    const tools = pi.getAllTools();
    const post = tools.find(tool => tool.name === 'board_post');
    assert.ok(post);
    const valid = { requestId: '00000000-0000-4000-a000-000000000001', kind: 'progress', body: 'Isolated schema check' };
    assert.deepEqual(validateToolArguments(post, { name: post.name, arguments: valid }), valid);
    for (const arguments_ of [{ ...valid, kind: 'invalid' }, { ...valid, actorKind: 'human' },
      { ...valid, body: '' }, { ...valid, requestId: 'invalid' }]) {
      assert.throws(() => validateToolArguments(post, { name: post.name, arguments: arguments_ }), /Validation failed/);
    }
    const read = tools.find(tool => tool.name === 'board_read');
    assert.deepEqual(validateToolArguments(read, { name: read.name, arguments: { limit: 100 } }), { limit: 100 });
    assert.throws(() => validateToolArguments(read, { name: read.name, arguments: { limit: 101 } }), /Validation failed/);
    ctx.ui.notify('Board JSON Schema validation passed (real Pi validator, no tool execution/model).', 'info');
  });
}
