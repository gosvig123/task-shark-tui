import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, loadTaskSnapshot, saveTask } from '../src/task-api.js';
import { editable, updateTask } from '../src/task-edit.js';
import { database } from '../src/task-database.js';
import { temporary } from './helpers.js';

test('local edits clear fields, preserve metadata and never change fixed snapshots', async t => {
  const root = temporary(t);
  await createTask(root, { list: 'Inbox', title: 'Original', description: 'Notes', dueDate: '2026-09-08' });
  const original = (await loadTaskSnapshot(root, 'Inbox')).tasks[0];
  database(root, db => saveTask(db, { ...original, subtasks: [{ id: 's', title: 'Keep', completed: false }] }));
  const result = await updateTask(root, original, { title: 'Edited', description: '', dueDate: '' });
  assert.equal(result.saved, true); assert.equal(result.snapshot!.tasks[0].description, '');
  assert.equal(result.snapshot!.tasks[0].dueDate, ''); assert.equal(result.snapshot!.tasks[0].subtasks.length, 1);
  assert.equal(original.title, 'Original'); assert.equal(original.description, 'Notes');
});
test('edit transaction rejects changed edited fields but merges unrelated changes', async t => {
  const root = temporary(t);
  await createTask(root, { list: 'Inbox', title: 'Original', description: 'Notes' });
  const original = (await loadTaskSnapshot(root, 'Inbox')).tasks[0];
  await updateTask(root, original, { ...editable(original), title: 'Other editor' });
  const conflict = await updateTask(root, original, { ...editable(original), title: 'My title' });
  assert.equal(conflict.saved, false); assert.equal(conflict.blocked, true);
  const merged = await updateTask(root, original, { ...editable(original), description: 'My notes' });
  assert.equal(merged.saved, true); assert.equal(merged.snapshot!.tasks[0].title, 'Other editor');
  database(root, db => db.prepare('DELETE FROM tasks WHERE id = ?').run(original.id));
  assert.equal((await updateTask(root, original, { ...editable(original), title: 'Gone' })).saved, false);
});
