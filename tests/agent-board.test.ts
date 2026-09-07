import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { boardFixture } from './agent-board-fixture.js';
import { boardEnvironment, cleanPiEnvironment, readBoardScope, boardExtension } from '../src/agent-board-scope.js';
import { piArguments } from '../src/pi-launch.js';
import { Store } from '../src/store.js';
import { Runtime, realFactory } from '../src/runtime.js';
const installed = existsSync('/Applications/TasksWidget.app/Contents/Resources/TaskBoardMCP/cli.mjs');

test('agent Board interoperates with human helper, binds attribution and namespaces retry IDs', { skip: !installed }, async t => {
  const f = boardFixture(t), requestId = randomUUID(), params = { requestId, kind: 'progress', body: 'Agent progress' };
  await Promise.all([f.agent().post(params, 'session-a'), f.agent().post(params, 'session-a'),
    f.agent('task-b', 'thread-b').post(params, 'session-b')]);
  await f.human.post('task-a', 'note', 'Human note', randomUUID());
  const page = await f.human.read('task-a'), agent = page.entries.find(e => e.actorKind === 'agent')!;
  assert.equal(page.entries.length, 2); assert.equal(agent.threadID, 'thread-a'); assert.equal(agent.sessionID, 'session-a');
  assert.equal(agent.source, 'Pi'); assert.equal(await f.human.review('task-a'), 0);
  assert.equal((await f.human.read('task-b')).entries.length, 1);
  await f.agent('task-a', 'thread-other').post(params, 'session-other');
  assert.equal((await f.human.read('task-a')).entries.length, 3);
  await assert.rejects(f.agent().post({ ...params, body: 'Changed retry' }, 'session-a'), /request_id_conflict/);
  assert.equal((await f.agent().brief({}, 'session-a') as any).exists, false);
  const read = await f.agent().read({ afterSequence: 0, limit: 1 }, 'session-a') as any;
  assert.equal(read.entries.length, 1); assert.equal(read.hasMore, true);
});
test('agent Board rejects scope/actor injection and invalid arguments before helper invocation', { skip: !installed }, async t => {
  const f = boardFixture(t), params = { requestId: randomUUID(), kind: 'progress', body: 'valid' };
  for (const patch of [{ taskID: 'other' }, { actorKind: 'human' }, { source: 'Human' },
    { body: '' }, { requestId: 'invalid' }, { kind: 'review' }, { body: 'x'.repeat(4001) }]) {
    await assert.rejects(f.agent().post({ ...params, ...patch }, 'session'));
  }
  await assert.rejects(f.agent().read({ limit: 101 }, 'session'));
  await assert.rejects(f.agent().read({ afterSequence: -1 }, 'session'));
  await assert.rejects(f.agent().brief({ taskID: 'other' }, 'session'));
  assert.equal(existsSync(f.root), false);
  assert.throws(() => readBoardScope({ ...f.env, TASKSHARK_BOARD_HELPER: join(f.resources, 'cli.mjs'), TASKSHARK_TASK_ID: '' }), /scope/);
});
test('task launches append explicit Board extension and fixed snapshot scope; general env stays clean', { skip: !installed }, t => {
  const f = boardFixture(t), store = new Store(join(f.home, 'app'), true);
  const c = store.create('Task chat', '', '', { id: 'attached-a', title: 'Task A', description: 'notes', ownerList: 'List', completed: false, subtasks: [] });
  const env = boardEnvironment(c, f.env), args = piArguments(c, 'sessions');
  assert.equal(env.TASKSHARK_TASK_ID, 'attached-a'); assert.equal(env.TASKSHARK_THREAD_ID, c.id);
  assert.equal(env.TASKSHARK_ACTOR_KIND, 'agent'); assert.equal(env.PI_SESSION_ID, undefined);
  assert.equal(args[args.indexOf('--extension') + 1], boardExtension);
  assert.match(args.at(-1)!, /read the task brief/); assert.match(args.at(-1)!, /Do not copy every response/);
  c.sessionFile = join(f.home, 'resume.jsonl'); writeFileSync(c.sessionFile, '');
  assert.equal(piArguments(c, 'sessions')[3], 'sessions'); assert.ok(piArguments(c, 'sessions').includes(c.sessionFile));
  const general = store.create('General', '', ''); assert.deepEqual(boardEnvironment(general, f.env), {});
  assert.equal(piArguments(general, 'sessions').includes('--extension'), false);
  const clean = cleanPiEnvironment(f.env);
  assert.equal(Object.keys(clean).some(k => k.startsWith('TASKSHARK_')), false); assert.equal(clean.PI_SESSION_ID, undefined);
});
test('missing helper preserves prompt and starts no Pi; launch preparation creates no config/root', { skip: !installed }, async t => {
  const f = boardFixture(t), store = new Store(join(f.home, 'app'), true);
  const c = store.create('Task chat', '', '', { id: 'a', title: 'A', ownerList: 'List', completed: false, subtasks: [] });
  const before = readdirSync(f.home);
  boardEnvironment(c, f.env); assert.deepEqual(readdirSync(f.home), before); assert.equal(existsSync(f.root), false);
  const saved = process.env.TASKSHARK_MCP_RESOURCE_DIR;
  process.env.TASKSHARK_MCP_RESOURCE_DIR = join(f.home, 'missing');
  t.after(() => { if (saved === undefined) delete process.env.TASKSHARK_MCP_RESOURCE_DIR; else process.env.TASKSHARK_MCP_RESOURCE_DIR = saved; });
  const runtime = new Runtime(store, realFactory('/must-not-start-pi'));
  await runtime.send(c, 'Keep this prompt');
  assert.match(c.error!, /TASKSHARK_MCP_RESOURCE_DIR/);
  assert.ok(c.messages.some(m => m.text.includes('Keep this prompt')));
  await runtime.close();
});
