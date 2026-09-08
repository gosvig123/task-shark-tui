import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, loadTaskSnapshot } from '../src/task-api.js';
import { editable, updateTask } from '../src/task-edit.js';
import { localDate, todayTasks } from '../src/task-today.js';
import { loadTaskCatalog } from '../src/tasks.js';
import { mutateTask } from '../src/task-mutations.js';
import { AgentBoardHelper } from '../src/agent-board-helper.js';
import { temporary } from './helpers.js';

test('Today includes matching source dates and tracks editor and agent changes without deleting sources', async t => {
  const root = temporary(t);
  const result = await createTask(root, { list: 'Inbox', title: 'Task', description: '' });
  const original = result.snapshot!.tasks[0];
  assert.equal((await loadTaskSnapshot(root, 'today')).tasks.length, 0);
  await updateTask(root, original, { ...editable(original), dueDate: localDate() });
  assert.equal((await loadTaskCatalog(root)).byList.get('today')![0].id, original.id);
  const helper = new AgentBoardHelper({ root, taskID: original.id, threadID: 'fixed', brief: '' });
  await helper.taskUpdate({ expected: { dueDate: localDate() }, changes: { dueDate: '9999-01-01' } });
  assert.equal((await loadTaskSnapshot(root, 'today')).tasks.length, 0);
  await helper.taskUpdate({ expected: { dueDate: '9999-01-01' }, changes: { dueDate: localDate() } });
  await mutateTask(root, original.id, { expected: { completed: false }, changes: { completed: true } });
  assert.equal((await loadTaskSnapshot(root, 'today')).tasks[0].completed, true);
  await helper.taskUpdate({ expected: { dueDate: localDate() }, changes: { dueDate: '' } });
  assert.equal((await loadTaskCatalog(root)).byList.get('today')!.length, 0);
  assert.equal((await loadTaskSnapshot(root, 'Inbox')).tasks[0].id, original.id);
});
test('Today creation defaults date but preserves explicit other and cleared dates', async t => {
  const root = temporary(t);
  await createTask(root, { list: 'today', title: 'Today', description: '' });
  for (const dueDate of ['9999-01-01', '2000-01-01', '']) {
    await createTask(root, { list: 'today', title: 'Other', description: '', dueDate });
  }
  assert.equal((await loadTaskSnapshot(root, 'today')).tasks.length, 1);
  assert.equal((await loadTaskSnapshot(root, 'Inbox')).tasks.length, 4);
});
test('local calendar dates and derived membership advance at midnight', () => {
  const now = new Date(2026, 8, 8, 23, 59, 59), next = new Date(2026, 8, 9, 0, 0, 0);
  const task = { id: 'a', title: 'A', ownerList: 'Inbox', completed: false, subtasks: [], dueDate: localDate(now) };
  assert.equal(localDate(now), '2026-09-08');
  assert.equal(todayTasks([task], localDate(now)).length, 1);
  assert.equal(todayTasks([task], localDate(next)).length, 0);
  assert.equal(todayTasks([{ ...task, dueDate: localDate(next) }], localDate(next)).length, 1);
});
