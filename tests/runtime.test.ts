import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Status } from '../src/model.js';
import { Store } from '../src/store.js';
import { runtimeFixture, waitFor, fakeFactory } from './helpers.js';
import { Runtime } from '../src/runtime.js';

const pending = (fixture: ReturnType<typeof runtimeFixture>, id: string) =>
  Boolean(fixture.runtime.states.get(id)?.requests.length);
test('RPC streaming, tool activity, approval, review, and saved resume work end to end', async t => {
  const f = runtimeFixture(t), c = f.store.create('Calendar', f.root, '');
  let streamed = false;
  f.runtime.on('change', () => { streamed ||= Boolean(f.runtime.state(c).partial); });
  await f.runtime.send(c, 'Please inspect');
  await waitFor(() => pending(f, c.id));
  assert.equal(c.status, Status.needsInput);
  assert.ok(c.messages.some(m => m.role === 'toolResult' && m.pi?.toolName === 'read' && m.text.includes('Fixture content')));
  f.runtime.answer(c, 'request', { confirmed: false });
  await waitFor(() => c.status === Status.review);
  assert.ok(streamed);
  assert.match(c.messages.at(-1)!.text, /"confirmed":false/);
  assert.ok(readFileSync(c.sessionFile!, 'utf8').includes('Fixture complete'));
  f.runtime.acknowledge(c);
  const restored = new Store(f.root, false).conversations[0];
  assert.equal(restored.sessionFile, c.sessionFile);
  assert.equal(restored.status, Status.finished);
});
test('conversations run concurrently and Queued Messages remain first-in-first-out', async t => {
  const f = runtimeFixture(t), a = f.store.create('A', f.root, ''), b = f.store.create('B', f.root, '');
  await Promise.all([f.runtime.send(a, 'first'), f.runtime.send(b, 'input')]);
  await f.runtime.send(a, 'second');
  await waitFor(() => pending(f, a.id) && pending(f, b.id));
  assert.deepEqual(a.queue, ['second']);
  f.runtime.answer(b, 'request', { value: 'B answer' });
  f.runtime.answer(a, 'request', { confirmed: true });
  await waitFor(() => b.status === Status.review && a.messages.some(m => m.text === 'second'));
  await waitFor(() => pending(f, a.id));
  f.runtime.answer(a, 'request', { cancelled: true });
  await waitFor(() => a.status === Status.review);
  assert.deepEqual(a.messages.filter(m => m.role === 'user').map(m => m.text), ['first', 'second']);
  assert.equal(b.status, Status.review);
});
test('command rejection, crash, and abort expose Needs Input without losing other runs', async t => {
  const f = runtimeFixture(t), a = f.store.create('A', f.root, ''), b = f.store.create('B', f.root, '');
  await f.runtime.send(a, 'reject');
  assert.equal(a.status, Status.needsInput);
  assert.match(a.error!, /rejection/);
  await f.runtime.send(b, 'inspect');
  await waitFor(() => pending(f, b.id));
  await f.runtime.abort(b);
  assert.equal(b.status, Status.needsInput);
  assert.equal(f.runtime.state(b).requests.length, 0);
  const c = f.store.create('Crash', f.root, '');
  await f.runtime.send(c, 'crash');
  assert.equal(c.status, Status.needsInput);
  assert.match(c.error!, /exited/);
});
test('select and editor Pi Requests return exact values and cancellation', async t => {
  const f = runtimeFixture(t), c = f.store.create('Requests', f.root, '');
  await f.runtime.send(c, 'select');
  await waitFor(() => pending(f, c.id));
  assert.equal(f.runtime.state(c).requests[0].method, 'select');
  f.runtime.answer(c, 'request', { value: 'Block' });
  await waitFor(() => c.status === Status.review);
  await f.runtime.send(c, 'editor');
  await waitFor(() => pending(f, c.id));
  f.runtime.answer(c, 'request', { value: 'Line 1\nLine 2' });
  await waitFor(() => c.status === Status.review);
  assert.match(c.messages.at(-1)!.text, /Line 1\\nLine 2/);
  assert.throws(() => f.runtime.answer(c, 'request', { cancelled: true }), /expired/);
});

test('a new runtime resumes the saved Pi session and loads authoritative history', async t => {
  const f = runtimeFixture(t), c = f.store.create('Resume', f.root, '');
  await f.runtime.send(c, 'first');
  await waitFor(() => pending(f, c.id));
  f.runtime.answer(c, 'request', { confirmed: true });
  await waitFor(() => c.status === Status.review);
  await f.runtime.close();
  const store = new Store(f.root, false), restored = store.conversations[0];
  const resumed = new Runtime(store, fakeFactory);
  try {
    await resumed.send(restored, 'second');
    await waitFor(() => Boolean(resumed.state(restored).requests.length));
    assert.equal(restored.sessionFile, c.sessionFile);
    assert.ok(restored.messages.some(m => m.pi?.role === 'assistant' && m.pi.content));
    assert.deepEqual(restored.messages.filter(m => m.role === 'user').map(m => m.text), ['first', 'second']);
    resumed.answer(restored, 'request', { cancelled: true });
    await waitFor(() => restored.status === Status.review);
  } finally { await resumed.close(); }
});
