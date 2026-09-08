import { localDate } from '../src/task-today.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { loadTaskCatalog } from '../src/tasks.js';
import { createTask, loadTaskSnapshot } from '../src/task-api.js';
import { database } from '../src/task-database.js';
import { manageTaskList } from '../src/task-lists.js';
import { mutateTask, readTask } from '../src/task-mutations.js';
import { temporary } from './helpers.js';

test('fresh SQLite startup seeds Inbox and empty Today; creation persists without external tools', async t => {
  const root = temporary(t), catalog = await loadTaskCatalog(root);
  assert.deepEqual(catalog.lists, ['Inbox', 'today']); assert.equal(catalog.currentList, 'Inbox');
  assert.deepEqual(catalog.tasks, []); assert.ok(existsSync(join(root, 'tasks.sqlite')));
  const result = await createTask(root, { list: 'Inbox', title: ' New task ', description: 'Notes\nNext', dueDate: '9999-01-01' });
  assert.equal(result.confirmed, true);
  const task = (await loadTaskCatalog(root)).tasks[0];
  assert.equal(task.title, 'New task'); assert.equal(task.description, 'Notes\nNext');
  assert.equal(task.completed, false); assert.equal(task.ownerList, 'Inbox'); assert.deepEqual(task.subtasks, []);
  assert.equal((await loadTaskSnapshot(root, 'today')).tasks.length, 0);
});
test('catalog matches list snapshots and refreshes edits, renames and Today membership', async t => {
  const root = temporary(t); manageTaskList(root, 'create', 'Work');
  await createTask(root, { list: 'Work', title: 'First', description: '' });
  await createTask(root, { list: 'today', title: 'Second', description: '' });
  const first = (await loadTaskCatalog(root)).byList.get('Work')![0];
  await mutateTask(root, first.id, { expected: { title: 'First' }, changes: { title: 'Changed' } });
  await mutateTask(root, first.id, { expected: { dueDate: readTask(root, first.id).dueDate ?? '' }, changes: { dueDate: localDate() } }); manageTaskList(root, 'rename', 'Work', 'Renamed');
  const catalog = await loadTaskCatalog(root);
  for (const list of catalog.lists) assert.deepEqual(catalog.byList.get(list), (await loadTaskSnapshot(root, list)).tasks);
  assert.equal(catalog.tasks.length, 2);
  assert.equal(catalog.byList.get('Renamed')![0].title, 'Changed');
  assert.equal(catalog.byList.has('Work'), false);
  assert.ok(catalog.tasks.every(task => task.placement === 'direct'));
  await mutateTask(root, first.id, { expected: { dueDate: readTask(root, first.id).dueDate ?? '' }, changes: { dueDate: '' } });
  assert.equal((await loadTaskCatalog(root)).byList.get('today')!.length, 1);
});
test('blank creation and missing lists fail without inserting tasks; transactions roll back', async t => {
  const root = temporary(t);
  await assert.rejects(createTask(root, { list: 'Inbox', title: ' ', description: '' }), /required/);
  await loadTaskCatalog(root);
  await assert.rejects(createTask(root, { list: 'removed', title: 'Task', description: '' }), /removed/);
  assert.throws(() => database(root, db => { db.prepare('INSERT INTO task_lists(name) VALUES (?)').run('Rollback'); throw new Error('rollback'); }));
  assert.deepEqual((await loadTaskCatalog(root)).lists, ['Inbox', 'today']);
});
test('catalog reads retain Today membership with canonical task identity while dates match', async t => {
  const root = temporary(t);
  await createTask(root, { list: 'today', title: 'Today task', description: '' });
  const first = await loadTaskCatalog(root), before = readFileSync(join(root, 'tasks.sqlite'));
  const second = await loadTaskCatalog(root);
  assert.equal(first.tasks.length, 1); assert.equal(second.byList.get('today')![0].id, first.tasks[0].id);
  assert.equal(first.tasks[0].ownerList, 'Inbox'); assert.equal(first.byList.get('today')![0].placement, 'reference');
  assert.deepEqual(readFileSync(join(root, 'tasks.sqlite')), before);
  database(root, db => db.prepare('DELETE FROM tasks WHERE id = ?').run(first.tasks[0].id));
  assert.deepEqual((await loadTaskSnapshot(root, 'today')).tasks, []);
});
