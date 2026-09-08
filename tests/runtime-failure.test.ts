import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { Runtime } from '../src/runtime.js';
import { Store } from '../src/store.js';
import { LocalRole, Status } from '../src/model.js';
import type { Transport } from '../src/rpc.js';
import type { Wire } from '../src/wire.js';
import { temporary, waitFor } from './helpers.js';

class ControlledClient extends EventEmitter implements Transport {
  prompts: string[] = [];
  reject?: string;
  async request(type: string, fields: Record<string, unknown> = {}): Promise<Wire> {
    if (type === 'prompt') {
      this.prompts.push(String(fields.message));
      if (fields.message === this.reject) throw new Error('Prompt rejected');
      this.emit('event', { type: 'agent_start' });
    }
    return { type: 'response', data: { isStreaming: true, messages: [], sessionFile: '/fixture/session.jsonl' } };
  }
  respond(): void {}
  async stop(): Promise<void> {}
  settle(error = false): void {
    this.emit('event', { type: 'message_end', message: { role: 'assistant',
      content: error ? 'Provider failed' : 'Done', stopReason: error ? 'error' : 'stop' } });
    this.emit('event', { type: 'agent_settled' });
  }
}
function fixture(t: TestContext) {
  const store = new Store(temporary(t), false), client = new ControlledClient();
  const runtime = new Runtime(store, () => client), c = store.create('Failure', '', '');
  t.after(() => runtime.close());
  return { store, client, runtime, c };
}
test('runtime: assistant failure quarantines queue before a successful recovery', async t => {
  const { runtime, client, c } = fixture(t);
  await runtime.send(c, 'first');
  await runtime.send(c, 'old one'); await runtime.send(c, 'old two');
  client.settle(true);
  assert.equal(c.status, Status.failed);
  assert.deepEqual(c.queue, []);
  assert.match(c.messages.find(m => m.role === LocalRole.unsentQueue)!.text, /old one\n\nold two/);
  await runtime.send(c, 'manual recovery'); client.settle();
  assert.deepEqual(client.prompts, ['first', 'manual recovery']);
  assert.equal(c.status, Status.review);
});
test('runtime: connection failure preserves the submitted text on disk', async t => {
  const store = new Store(temporary(t), true), c = store.create('Missing Pi', '', '');
  const runtime = new Runtime(store, () => { throw new Error('Missing executable'); });
  t.after(() => runtime.close());
  await runtime.send(c, 'do not lose 世界');
  const saved = JSON.parse(readFileSync(store.index, 'utf8')).conversations[0];
  assert.equal(saved.inFlight, undefined);
  assert.match(saved.messages[0].text, /do not lose 世界/);
  assert.equal(saved.messages[0].role, LocalRole.unsentSubmission);
});
test('runtime: prompt rejection and reconnect retain text for manual resubmission', async t => {
  const { runtime, client, c } = fixture(t);
  client.reject = 'rejected submission';
  await runtime.send(c, client.reject);
  assert.match(c.messages.find(m => m.role === LocalRole.unsentSubmission)!.text, /rejected submission/);
  await runtime.send(c, 'manual recovery'); client.settle();
  assert.ok(c.messages.some(m => m.role === LocalRole.unsentSubmission));
  assert.deepEqual(client.prompts, ['rejected submission', 'manual recovery']);
});
test('runtime: dequeued rejection is retained, remaining queue cannot replay', async t => {
  const { runtime, client, c } = fixture(t);
  await runtime.send(c, 'first');
  await runtime.send(c, 'reject next'); await runtime.send(c, 'last queued');
  client.reject = 'reject next'; client.settle();
  await waitFor(() => c.status === Status.failed);
  assert.match(c.messages.find(m => m.role === LocalRole.unsentSubmission)!.text, /reject next/);
  assert.equal(c.messages.find(m => m.role === LocalRole.unsentQueue)!.text, 'last queued');
  await runtime.send(c, 'recovery'); client.settle();
  assert.deepEqual(client.prompts, ['first', 'reject next', 'recovery']);
});
test('runtime: transport failure clears live output and keeps interrupted evidence', async t => {
  const { runtime, client, c } = fixture(t);
  await runtime.send(c, 'inspect');
  client.emit('event', { type: 'message_end', message: { role: 'user', content: 'inspect' } });
  client.emit('event', { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'unfinished text' } });
  client.emit('event', { type: 'tool_execution_start', toolCallId: 'tool', toolName: 'read' });
  client.emit('failure', new Error('Transport lost'));
  const live = runtime.state(c);
  assert.equal(live.partial, ''); assert.equal(live.activity.size, 0);
  assert.equal(live.running, false);
  const interrupted = c.messages.filter(m => m.role === LocalRole.interrupted);
  assert.equal(interrupted[0].text, 'unfinished text');
  assert.match(interrupted[1].text, /read · interrupted/);
  await runtime.send(c, 'retry');
  assert.match(c.messages.find(m => m.role === LocalRole.unsentSubmission)!.text, /inspect/);
  assert.equal(live.partial, ''); assert.equal(live.activity.size, 0);
});
test('runtime: in-flight text is persisted before connection and never replayed after restart', async t => {
  const store = new Store(temporary(t), true), c = store.create('Pending', '', '');
  const client = new ControlledClient();
  const runtime = new Runtime(store, () => {
    assert.equal(JSON.parse(readFileSync(store.index, 'utf8')).conversations[0].inFlight, 'pending');
    return client;
  });
  t.after(() => runtime.close());
  await runtime.send(c, 'pending');
  const restored = new Store(store.root, true).conversations[0];
  assert.equal(restored.inFlight, undefined);
  assert.match(restored.messages[0].text, /pending/);
});
