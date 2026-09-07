import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSnapshot, deduplicate, loadTasks, loadTaskCatalog } from '../src/tasks.js';
import { createTask } from '../src/task-api.js';
import { taskFixture } from './task-fixture.js';

const fixture = readFileSync(new URL('./fixtures/tasks.json', import.meta.url), 'utf8');
test('tasks snapshot retains source, notes, dates and subtasks; direct entry wins', () => {
  const tasks = deduplicate(parseSnapshot(fixture));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].ownerList, 'Work');
  assert.equal(tasks[0].title, 'Fix calendar sync');
  assert.equal(tasks[0].subtasks[0].title, 'Check cancelled events');
  assert.match(tasks[0].description!, /Two subscriptions/);
  assert.throws(() => parseSnapshot('{"schemaVersion":2,"tasks":[]}'));
  assert.throws(() => parseSnapshot('not json'));
});
test('tasks catalog uses api lists including empty/active lists and preserves Today references', async t => {
  const { binary, calls } = taskFixture(t);
  await assert.rejects(loadTasks(binary), /rewrite today.md/);
  assert.equal(calls().length, 0);
  const catalog = await loadTaskCatalog(binary, true);
  assert.equal(catalog.currentList, 'Empty list');
  assert.deepEqual(catalog.lists, ['Work', 'today', 'Empty list']);
  assert.equal(catalog.tasks.length, 1);
  assert.equal(catalog.byList.get('today')![0].ownerList, 'Work');
  assert.deepEqual(catalog.byList.get('Empty list'), []);
  assert.deepEqual(calls().at(-1).args, ['api', 'snapshot', '--list', 'Empty list']);
});
test('task creation uses latest revision, saves Pending in chosen list, refreshes source', async t => {
  const { binary, calls } = taskFixture(t);
  const result = await createTask(binary, { list: 'Empty list', title: ' New task ', description: 'Notes' }, true);
  assert.equal(result.confirmed, true);
  assert.deepEqual(calls().map(c => c.args), [['api', 'snapshot', '--list', 'Empty list'], ['api', 'exec'],
    ['api', 'snapshot', '--list', 'Empty list']]);
  assert.equal(calls()[1].input.expectedRevision, 'revision-1');
  assert.deepEqual(calls()[1].input.changes, { title: 'New task', description: 'Notes', completed: false });
  assert.equal(result.snapshot?.tasks[0].completed, false);
  assert.equal(result.snapshot?.tasks[0].ownerList, 'Empty list');
});
test('blank task or missing consent cannot call the task API', async t => {
  const { binary, calls } = taskFixture(t);
  await assert.rejects(createTask(binary, { list: 'Work', title: ' ', description: '' }, true), /required/);
  await assert.rejects(createTask(binary, { list: 'Work', title: 'test', description: '' }), /rewrite today.md/);
  assert.deepEqual(calls(), []);
});
test('revision conflicts refresh source but never retry creation', async t => {
  const { root, binary, calls } = taskFixture(t);
  writeFileSync(join(root, 'mode'), 'conflict');
  const result = await createTask(binary, { list: 'Empty list', title: 'Task', description: '' }, true);
  assert.equal(result.confirmed, false);
  assert.match(result.notice, /changed/);
  assert.deepEqual(result.snapshot?.tasks, []);
  assert.equal(calls().filter(c => c.args[1] === 'exec').length, 1);
});
for (const mode of ['partial-failure', 'malformed']) test(`task ${mode} exposes uncertain creation without retry`, async t => {
  const { root, binary, calls } = taskFixture(t);
  writeFileSync(join(root, 'mode'), mode);
  const result = await createTask(binary, { list: 'Empty list', title: 'Task', description: '' }, true);
  assert.equal(result.confirmed, false);
  assert.match(result.notice, /may have saved/);
  assert.equal(result.snapshot?.tasks.length, 1);
  assert.equal(calls().filter(c => c.args[1] === 'exec').length, 1);
});
