import test from 'node:test';
import assert from 'node:assert/strict';
import { temporary } from './helpers.js';
import { createTask, loadTaskSnapshot } from '../src/task-api.js';
import { readTask, mutateTask, deleteTask, setToday } from '../src/task-mutations.js';
import { manageTaskList } from '../src/task-lists.js';
import { AgentBoardHelper } from '../src/agent-board-helper.js';

async function fixture(t: import('node:test').TestContext) {
  const root = temporary(t);
  const result = await createTask(root, { list: 'Inbox', title: 'Original', description: '' });
  return { root, task: result.snapshot!.tasks[0] };
}
test('task mutations validate fields and reject stale updates atomically', async t => {
  const { root, task } = await fixture(t);
  await mutateTask(root, task.id, { expected: { title: task.title }, changes: { title: 'Current' } });
  await assert.rejects(mutateTask(root, task.id, { expected: { title: task.title, completed: false }, changes: { title: 'Stale', completed: true } }), /Task changed/);
  assert.equal(readTask(root, task.id).completed, false);
  for (const changes of [{ title: '' }, { dueDate: '2026-02-30' }, { dueDate: ' 2026-01-01 ' }, { completed: 'yes' }, { ownerList: 'Other' },
    { subtasks: [{ id: 'a', title: 'A', completed: false }, { id: 'a', title: 'B', completed: true }] }]) {
    const expected = Object.fromEntries(Object.keys(changes).map(key => [key, key === 'dueDate' ? '' : task[key as keyof typeof task]]));
    await assert.rejects(mutateTask(root, task.id, { expected, changes }));
  }
  await assert.rejects(mutateTask(root, task.id, { expected: {}, changes: {} }), /nonempty/);
});
test('subtasks, completion, Today and deletion operate on the source task', async t => {
  const { root, task } = await fixture(t);
  const subtasks = [{ id: 'sub', title: 'Step', completed: false }];
  await mutateTask(root, task.id, { expected: { subtasks: [] }, changes: { subtasks } });
  await mutateTask(root, task.id, { expected: { subtasks }, changes: { subtasks: [{ ...subtasks[0], title: 'Renamed', completed: true }] } });
  await mutateTask(root, task.id, { expected: { completed: false }, changes: { completed: true } });
  await mutateTask(root, task.id, { expected: { completed: true }, changes: { completed: false } });
  setToday(root, task.id, true); setToday(root, task.id, false); setToday(root, task.id, true);
  assert.equal((await loadTaskSnapshot(root, 'today')).tasks.length, 1);
  assert.throws(() => deleteTask(root, task), /Task changed/);
  deleteTask(root, readTask(root, task.id));
  assert.equal((await loadTaskSnapshot(root, 'today')).tasks.length, 0);
  assert.throws(() => readTask(root, task.id), /deleted/);
});
test('Task List operations protect Today, active and nonempty lists', async t => {
  const { root, task } = await fixture(t);
  for (const action of ['create', 'rename', 'activate', 'delete'] as const) assert.throws(() => manageTaskList(root, action, 'Today', 'Other'), /reserved/);
  manageTaskList(root, 'create', 'Work');
  assert.throws(() => manageTaskList(root, 'delete', 'Inbox'), /Active/);
  manageTaskList(root, 'activate', 'Work');
  assert.throws(() => manageTaskList(root, 'delete', 'Inbox'), /empty/);
  setToday(root, task.id, true); manageTaskList(root, 'rename', 'Inbox', 'Renamed');
  assert.equal(readTask(root, task.id).ownerList, 'Renamed');
  assert.equal((await loadTaskSnapshot(root, 'today')).tasks[0].ownerList, 'Renamed');
  manageTaskList(root, 'activate', 'Renamed'); manageTaskList(root, 'delete', 'Work');
  await assert.rejects(loadTaskSnapshot(root, 'Work'), /removed/);
});
test('agent task tools keep fixed IDs and separate current task from brief snapshot', async t => {
  const { root, task } = await fixture(t), brief = JSON.stringify(task);
  const helper = new AgentBoardHelper({ root, taskID: task.id, threadID: 'fixed', brief });
  await helper.taskUpdate({ expected: { title: task.title }, changes: { title: 'Agent edit' } });
  assert.equal((await helper.taskRead({}) as typeof task).title, 'Agent edit');
  assert.equal((await helper.brief({}, 'session') as { content: string }).content, brief);
  await assert.rejects(helper.taskUpdate({ taskID: 'other', expected: { completed: false }, changes: { completed: true } }));
  await assert.rejects(helper.taskRead({ taskID: 'other' }));
  deleteTask(root, readTask(root, task.id));
  await assert.rejects(helper.taskRead({}), /deleted/);
  assert.equal((await helper.brief({}, 'session') as { content: string }).content, brief);
});
test('an unchanged agent due date preserves Today membership', async t => {
  const { root, task } = await fixture(t);
  setToday(root, task.id, true);
  const dueDate = task.dueDate ?? '';
  await mutateTask(root, task.id, { expected: { dueDate }, changes: { dueDate } });
  assert.equal((await loadTaskSnapshot(root, 'today')).tasks.length, 1);
  await mutateTask(root, task.id, { expected: { dueDate }, changes: { dueDate: '2030-01-01' } });
  assert.equal((await loadTaskSnapshot(root, 'today')).tasks.length, 0);
});
