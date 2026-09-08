import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, loadTaskSnapshot } from '../src/task-api.js';
import { editable, updateTask } from '../src/task-edit.js';
import { removeTodayReference } from '../src/task-today.js';
import { database } from '../src/task-database.js';
import { temporary } from './helpers.js';

test('date changes remove Today references in a separate transaction and preserve source tasks', async t => {
  const root = temporary(t);
  await createTask(root, { list: 'today', title: 'Task', description: '' });
  const original = (await loadTaskSnapshot(root, 'today')).tasks[0];
  await updateTask(root, original, { ...editable(original), title: 'Title only' });
  assert.equal((await loadTaskSnapshot(root, 'today')).tasks.length, 1);
  const result = await updateTask(root, original, { ...editable(original), dueDate: '2026-09-08' });
  assert.equal(result.saved, true); assert.equal(result.todayPending, false);
  assert.equal((await loadTaskSnapshot(root, 'today')).tasks.length, 0);
  assert.equal((await loadTaskSnapshot(root, 'Inbox')).tasks[0].id, original.id);
  assert.equal(result.snapshot!.tasks[0].dueDate, '2026-09-08');
  assert.equal((await removeTodayReference(root, original)).complete, true);
});
test('failed Today removal keeps the saved date and retry removes only membership', async t => {
  const root = temporary(t);
  await createTask(root, { list: 'today', title: 'Task', description: '' });
  const original = (await loadTaskSnapshot(root, 'today')).tasks[0];
  database(root, db => db.exec("CREATE TRIGGER refuse_removal BEFORE DELETE ON today BEGIN SELECT RAISE(ABORT, 'blocked'); END"));
  const result = await updateTask(root, original, { ...editable(original), dueDate: '2026-09-08' });
  assert.equal(result.saved, true); assert.equal(result.todayPending, true);
  assert.equal((await loadTaskSnapshot(root, 'Inbox')).tasks[0].dueDate, '2026-09-08');
  database(root, db => db.exec('DROP TRIGGER refuse_removal'));
  assert.equal((await removeTodayReference(root, original)).complete, true);
  assert.equal((await loadTaskSnapshot(root, 'Inbox')).tasks[0].dueDate, '2026-09-08');
});
