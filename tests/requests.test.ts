import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout } from 'node:timers/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Runtime } from '../src/runtime.js';
import { Store } from '../src/store.js';
import { Status } from '../src/model.js';
import type { Transport } from '../src/rpc.js';
import type { Wire } from '../src/wire.js';

class ManualClient extends EventEmitter implements Transport {
  responses: Record<string, unknown>[] = [];
  async request(): Promise<Wire> { return { type: 'response', success: true, data: { isStreaming: true } }; }
  respond(id: string, fields: Record<string, unknown>): void { this.responses.push({ id, ...fields }); }
  async stop(): Promise<void> {}
}
test('expired request timers cannot make acknowledged work unread again', async () => {
  const root = mkdtempSync(join(tmpdir(), 'task-shark-request-'));
  const store = new Store(root, true), client = new ManualClient(), runtime = new Runtime(store, () => client);
  try {
    const c = store.create('Request', root, '');
    await runtime.send(c, 'inspect');
    client.emit('event', { type: 'extension_ui_request', id: 'timed', method: 'confirm', timeout: 25 });
    assert.equal(c.status, Status.needsInput);
    runtime.answer(c, 'timed', { confirmed: false });
    client.emit('event', { type: 'agent_settled' });
    runtime.acknowledge(c);
    await setTimeout(50);
    assert.equal(c.status, Status.finished);
    assert.deepEqual(client.responses, [{ id: 'timed', confirmed: false }]);
  } finally { await runtime.close(); rmSync(root, { recursive: true, force: true }); }
});
test('dialog timeout clears Needs Input without sending a stale response', async () => {
  const root = mkdtempSync(join(tmpdir(), 'task-shark-request-'));
  const store = new Store(root, true), client = new ManualClient(), runtime = new Runtime(store, () => client);
  try {
    const c = store.create('Request', root, '');
    await runtime.send(c, 'inspect');
    client.emit('event', { type: 'extension_ui_request', id: 'timed', method: 'input', timeout: 25 });
    await setTimeout(50);
    assert.equal(c.status, Status.running);
    assert.throws(() => runtime.answer(c, 'timed', { value: 'late' }), /expired/);
    assert.equal(client.responses.length, 0);
  } finally { await runtime.close(); rmSync(root, { recursive: true, force: true }); }
});
