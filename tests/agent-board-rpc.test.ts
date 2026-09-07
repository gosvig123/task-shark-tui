import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Store } from '../src/store.js';
import { realFactory } from '../src/runtime.js';
import { piArguments } from '../src/pi-launch.js';
import { boardFixture } from './agent-board-fixture.js';
import { boardExtension } from '../src/agent-board-scope.js';
const installed = existsSync('/Applications/TasksWidget.app/Contents/Resources/TaskBoardMCP/cli.mjs');
function setEnvironment(t: import('node:test').TestContext, values: NodeJS.ProcessEnv): void {
  const saved = { ...process.env };
  Object.assign(process.env, values);
  t.after(() => { for (const key of Object.keys(values)) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  } });
}
test('real launch factory isolates concurrent tasks and general RPC env, including resumed snapshot', { skip: !installed }, async t => {
  const f = boardFixture(t); setEnvironment(t, f.env);
  const binary = join(f.home, 'pi'); cpSync(resolve('tests/fixtures/fake-board-pi.mjs'), binary); chmodSync(binary, 0o700);
  const store = new Store(join(f.home, 'app'), false), task = { id: 'task-a', title: 'A', ownerList: 'Work', completed: false, subtasks: [] };
  const a = store.create('A chat', f.home, '', task), b = store.create('B chat', f.home, '', { ...task, id: 'task-b' });
  const general = store.create('General', f.home, '');
  a.sessionFile = join(f.home, 'saved.jsonl'); writeFileSync(a.sessionFile, '');
  const conversations = [a, b, general], clients = conversations.map(c => realFactory(binary)(c, store.sessions(c)));
  clients.forEach(client => client.on('failure', () => {}));
  try {
    const results = await Promise.all(clients.map(client => client.request('prompt', { message: 'not a model call' })));
    results.forEach((r, i) => checkCapture(JSON.parse(r.data!.messages![0].content as string), conversations[i], store.sessions(conversations[i])));
    assert.equal(existsSync(f.root), false);
  } finally { await Promise.all(clients.map(client => client.stop())); }
});
function checkCapture(capture: any, c: import('../src/model.js').Conversation, sessions: string): void {
  assert.deepEqual(capture.args, piArguments(c, sessions)); assert.equal(capture.env.HOME, c.workspace);
  assert.equal(capture.env.PI_SESSION_ID, undefined); assert.equal(capture.prompt, 'not a model call');
  if (c.task) {
    assert.equal(capture.env.TASKSHARK_TASK_ID, c.task.id); assert.equal(capture.env.TASKSHARK_THREAD_ID, c.id);
    assert.equal(capture.env.TASKSHARK_ACTOR_KIND, 'agent'); assert.ok(capture.args.includes(boardExtension));
    assert.equal(capture.env.TASKSHARK_ACTOR_SOURCE, undefined);
  } else assert.equal(Object.keys(capture.env).some(key => key.startsWith('TASKSHARK_')), false);
}
test('readiness rejection occurs before prompt delivery and leaves the transport usable', { skip: !installed }, async t => {
  const f = boardFixture(t); setEnvironment(t, f.env);
  const binary = join(f.home, 'pi'); cpSync(resolve('tests/fixtures/fake-board-pi.mjs'), binary); chmodSync(binary, 0o700);
  const store = new Store(join(f.home, 'app'), false);
  const c = store.create('Task', f.home, '', { id: 'a', title: 'A', ownerList: 'Work', completed: false, subtasks: [] });
  const client = realFactory(binary)(c, store.sessions(c)); client.on('failure', () => {});
  writeFileSync(join(f.home, 'disable-board'), '');
  try {
    await assert.rejects(client.request('prompt', { message: 'retained' }), /Board tools unavailable/);
    assert.equal((await client.request('get_state')).success, true);
  } finally { await client.stop(); }
});
