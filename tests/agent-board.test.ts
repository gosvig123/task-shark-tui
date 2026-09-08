import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { boardFixture } from './agent-board-fixture.js';
import { boardEnvironment, cleanPiEnvironment, readBoardScope, boardExtension } from '../src/agent-board-scope.js';
import { piArguments } from '../src/pi-launch.js';
import { Store } from '../src/store.js';

test('agent Board interoperates with human client, binds attribution and namespaces retry IDs', async t => {
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
  await assert.rejects(f.agent().post({ ...params, body: 'Changed retry' }, 'session-a'), /conflicts/);
  assert.equal((await f.agent().brief({}, 'session-a') as any).exists, true);
  const read = await f.agent().read({ afterSequence: 0, limit: 1 }, 'session-a') as any;
  assert.equal(read.entries.length, 1); assert.equal(read.hasMore, true);
});
test('agent Board rejects scope/actor injection and invalid arguments before database access', async t => {
  const f = boardFixture(t), params = { requestId: randomUUID(), kind: 'progress', body: 'valid' };
  for (const patch of [{ taskID: 'other' }, { actorKind: 'human' }, { source: 'Human' },
    { body: '' }, { requestId: 'invalid' }, { kind: 'review' }, { body: 'x'.repeat(4001) }]) {
    await assert.rejects(f.agent().post({ ...params, ...patch }, 'session'));
  }
  await assert.rejects(f.agent().read({ limit: 101 }, 'session'));
  await assert.rejects(f.agent().read({ afterSequence: -1 }, 'session'));
  await assert.rejects(f.agent().brief({ taskID: 'other' }, 'session'));
  assert.equal(existsSync(f.root), false);
  assert.throws(() => readBoardScope({ ...f.env, TASKSHARK_TASK_ID: '' }), /scope/);
});
test('task launches append explicit Board extension and fixed snapshot scope; general env stays clean', t => {
  const f = boardFixture(t), store = new Store(join(f.home, 'app'), true);
  const c = store.create('Task chat', '', '', { id: 'attached-a', title: 'Task A', description: 'notes', ownerList: 'List', completed: false, subtasks: [] });
  const env = boardEnvironment(c, f.root), args = piArguments(c, 'sessions');
  assert.equal(env.TASKSHARK_TASK_ID, 'attached-a'); assert.equal(env.TASKSHARK_THREAD_ID, c.id);
  assert.equal(env.TASKSHARK_ACTOR_KIND, 'agent'); assert.equal(env.PI_SESSION_ID, undefined);
  assert.equal(args[args.indexOf('--extension') + 1], boardExtension);
  assert.match(args.at(-1)!, /read the task brief/); assert.match(args.at(-1)!, /Do not copy every response/);
  c.sessionFile = join(f.home, 'resume.jsonl'); writeFileSync(c.sessionFile, '');
  assert.equal(piArguments(c, 'sessions')[3], 'sessions'); assert.ok(piArguments(c, 'sessions').includes(c.sessionFile));
  const general = store.create('General', '', ''); assert.deepEqual(boardEnvironment(general, f.root), {});
  assert.equal(piArguments(general, 'sessions').includes('--extension'), false);
  const clean = cleanPiEnvironment(f.env);
  assert.equal(Object.keys(clean).some(k => k.startsWith('TASKSHARK_')), false); assert.equal(clean.PI_SESSION_ID, undefined);
});
